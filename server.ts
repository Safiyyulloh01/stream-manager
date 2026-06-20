import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";
import "dotenv/config";
import { 
  searchYouTube, resolveChannel, getChannelLiveStreams, getVideoInfo,
  getOAuthUrl, exchangeCodeForTokens, listMyChannels,
  createBroadcast, endBroadcast, refreshAccessToken
} from "./src/lib/youtube-api";

// --- DATABASE SETUP ---
const DB_PATH = "stream_manager.db";

function createEmptyDb(): SqlJsDatabase {
  return new (require("sql.js").Database)();
}

let db: SqlJsDatabase;

async function initDb() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode (best effort)
  db.run("PRAGMA journal_mode=WAL;");
  
  // Initialize tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS youtube_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      youtube_channel_id TEXT,
      oauth_tokens TEXT DEFAULT '{}',
      name TEXT,
      avatar TEXT,
      subscriber_count TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tracked_channels (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      channel_id TEXT,
      channel_name TEXT,
      channel_avatar TEXT,
      auto_monitor BOOLEAN DEFAULT 1,
      auto_mirror BOOLEAN DEFAULT 0,
      scan_frequency INTEGER DEFAULT 5,
      notifications TEXT DEFAULT '{"live_detected":true,"mirroring_started":true,"mirroring_ended":true,"stream_ended":true}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES youtube_accounts(id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      source_stream_id TEXT,
      tracked_channel_id TEXT,
      title TEXT,
      description TEXT DEFAULT '',
      thumbnail TEXT,
      status TEXT DEFAULT 'LIVE',
      stream_type TEXT DEFAULT '16:9',
      category TEXT DEFAULT '',
      viewer_count INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(tracked_channel_id) REFERENCES tracked_channels(id)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS mirroring_jobs (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      source_stream_id TEXT,
      target_broadcast_id TEXT,
      status TEXT DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY(account_id) REFERENCES youtube_accounts(id),
      FOREIGN KEY(source_stream_id) REFERENCES streams(id)
    );
  `);

  // Add missing columns (sql.js ignores duplicate ALTER TABLE safely)
  const addColIfMissing = (table: string) => {
    try { db.run(`ALTER TABLE youtube_accounts ADD COLUMN subscriber_count TEXT DEFAULT ''`); } catch {}
    try { db.run(`ALTER TABLE youtube_accounts ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch {}
    try { db.run(`ALTER TABLE tracked_channels ADD COLUMN scan_frequency INTEGER DEFAULT 5`); } catch {}
    try { db.run(`ALTER TABLE tracked_channels ADD COLUMN notifications TEXT DEFAULT '{}'`); } catch {}
    try { db.run(`ALTER TABLE streams ADD COLUMN description TEXT DEFAULT ''`); } catch {}
    try { db.run(`ALTER TABLE streams ADD COLUMN category TEXT DEFAULT ''`); } catch {}
    try { db.run(`ALTER TABLE streams ADD COLUMN viewer_count INTEGER DEFAULT 0`); } catch {}
    try { db.run(`ALTER TABLE streams ADD COLUMN started_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch {}
    try { db.run(`ALTER TABLE mirroring_jobs ADD COLUMN ingest_url TEXT DEFAULT ''`); } catch {}
    try { db.run(`ALTER TABLE mirroring_jobs ADD COLUMN stream_name TEXT DEFAULT ''`); } catch {}
    try { db.run(`ALTER TABLE streams ADD COLUMN duration INTEGER DEFAULT 0`); } catch {}
  };
  addColIfMissing("youtube_accounts");

  // Create admin user if not exists (no mock accounts, no seed data)
  const stmt = db.prepare("SELECT COUNT(*) as count FROM users");
  let hasUsers = false;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { count: number };
    hasUsers = row.count > 0;
  }
  stmt.free();

  if (!hasUsers) {
    const userId = uuidv4();
    db.run("INSERT INTO users (id, email) VALUES (?, ?)", [userId, "admin@streammanager.test"]);
  }

  saveDb();
}

function saveDb() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error("Failed to save DB:", e);
  }
}

// Query helpers
function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql: string, params: any[] = []): any | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result: any | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function runSql(sql: string, params: any[] = []) {
  db.run(sql, params);
  saveDb();
}


// --- BACKGROUND WORKER ---
function startBackgroundWorker(broadcast: (event: string, payload: any) => void) {
  // Scan tracked channels for new live streams (InnerTube — no API key needed)
  setInterval(async () => {
    try {
      const autoChannels = queryAll("SELECT * FROM tracked_channels WHERE auto_monitor = 1");
      
      for (const channel of autoChannels) {
        const ch = channel as any;
        const chId = String(ch.channel_id || "");
        if (!chId || chId === "undefined" || chId === "null") continue;

        const existingLive = queryOne(
          "SELECT COUNT(*) as count FROM streams WHERE tracked_channel_id = ? AND status IN ('LIVE', 'MIRRORING')",
          [String(ch.id)]
        );
        
        if (existingLive && Number((existingLive as any).count) > 0) continue;

        let liveStreams: any[] = [];

        try {
          liveStreams = await getChannelLiveStreams(chId);
        } catch (e) {
          continue;
        }

        if (!liveStreams || liveStreams.length === 0) continue;

        for (const ls of liveStreams) {
          const lsId = String(ls.id || "");
          if (!lsId) continue;
          
          const existingStream = queryOne("SELECT id FROM streams WHERE source_stream_id = ?", [lsId]);
          if (existingStream) continue;

          const streamId = uuidv4();
          runSql(
            `INSERT INTO streams (id, source_stream_id, tracked_channel_id, title, description, thumbnail, status, stream_type, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [streamId, lsId, String(ch.id), String(ls.title || "Live Stream"), String(ls.description || ""), String(ls.thumbnail || ""), "LIVE", "16:9", Number(ls.viewerCount) || 0, String(ls.startedAt || new Date().toISOString())]
          );

          const newStream = queryOne(`SELECT s.*, c.channel_name, c.channel_avatar FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]);
          if (newStream) broadcast("STREAM_DETECTED", newStream);

          if (ch.auto_mirror) {
            runSql("UPDATE streams SET status = 'MIRRORING' WHERE id = ?", [streamId]);
            runSql("INSERT INTO mirroring_jobs (id, account_id, source_stream_id, target_broadcast_id, status, started_at) VALUES (?, ?, ?, ?, ?, ?)", [
              uuidv4(), String(ch.account_id || ""), streamId, "local_" + uuidv4().slice(0, 8), "active", new Date().toISOString()
            ]);
            const us = queryOne(`SELECT s.*, c.channel_name, c.channel_avatar FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]);
            if (us) {
              broadcast("STREAM_UPDATED", us);
              broadcast("MIRRORING_STARTED", { stream: us });
            }
          }
        }
      }
    } catch (e) {
      console.error("Background worker error:", e);
    }
  }, 60000);

  // Helper: end a stream (stop mirroring via API, update DB, broadcast)
  const endStream = (s: any) => {
    const wasMirroring = s.status === 'MIRRORING';

    if (wasMirroring) {
      // End the YouTube broadcast via API if it has a real broadcast ID
      const job = queryOne("SELECT * FROM mirroring_jobs WHERE source_stream_id = ? AND status = 'active'", [s.id]) as any;
      if (job && job.target_broadcast_id && !String(job.target_broadcast_id).startsWith("local_")) {
        const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [job.account_id]) as any;
        if (account) {
          const tokens = JSON.parse(account.oauth_tokens || "{}");
          if (tokens.access_token) {
            endBroadcast(tokens.access_token, job.target_broadcast_id).catch(() => {});
          }
        }
      }

      runSql(
        "UPDATE mirroring_jobs SET status = 'ended', ended_at = ? WHERE source_stream_id = ? AND status = 'active'",
        [new Date().toISOString(), s.id]
      );
    }

    runSql("UPDATE streams SET status = 'ENDED' WHERE id = ?", [s.id]);
    const endedStream = queryOne(
      `SELECT s.*, c.channel_name, c.channel_avatar FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`,
      [s.id]
    );
    if (endedStream) broadcast("STREAM_ENDED", endedStream);
  };

  // Stream ending detection
  setInterval(async () => {
    try {
      const activeStreams = queryAll(
        "SELECT s.*, c.channel_name, c.channel_avatar, c.account_id FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.status IN ('LIVE', 'MIRRORING')"
      );
      
      for (const stream of activeStreams) {
        const s = stream as any;
        const srcId = String(s.source_stream_id || "");

        // Simulated streams (auto_ prefix): auto-end after 2-5 minutes
        if (srcId.startsWith("auto_")) {
          const startedAt = new Date(s.started_at).getTime();
          const age = Date.now() - startedAt;
          if (age > 120000 + Math.random() * 180000) endStream(s);
          continue;
        }

        // Real YouTube streams (11-char video ID): check status
        if (srcId.length === 11 && !srcId.startsWith("local_")) {
          try {
            const info = await getVideoInfo(srcId);
            if (!info || !info.exists) continue; // API glitch, skip this cycle

            if (info.isLive) {
              // Still live — update viewer count
              runSql("UPDATE streams SET viewer_count = ? WHERE id = ?", [info.viewCount, s.id]);
              continue;
            }

            // Not live — regular video being mirrored
            if (info.duration > 0) {
              // Check if the video finished playing
              const startedAt = new Date(s.started_at).getTime();
              const elapsed = (Date.now() - startedAt) / 1000;
              if (elapsed >= info.duration) endStream(s);
              // If not finished yet, do nothing — keep mirroring
            } else {
              // No duration info — assume stream ended
              endStream(s);
            }
          } catch (e) {
            // InnerTube error — skip this cycle
          }
        }
      }
    } catch (e) {
      console.error("Stream ending detection error:", e);
    }
  }, 30000); // Check every 30s

  // Update viewer counts (real streams from getVideoInfo, simulated otherwise)
  setInterval(async () => {
    try {
      const liveStreams = queryAll("SELECT id, viewer_count, source_stream_id, started_at FROM streams WHERE status IN ('LIVE', 'MIRRORING')");
      for (const stream of liveStreams) {
        const s = stream as any;
        const srcId = String(s.source_stream_id || "");
        // Real YouTube streams: fetch viewer count from video info
        if (srcId.length === 11 && !srcId.startsWith("auto_") && !srcId.startsWith("local_")) {
          try {
            const info = await getVideoInfo(srcId);
            if (info && info.exists) runSql("UPDATE streams SET viewer_count = ? WHERE id = ?", [info.viewCount, s.id]);
          } catch {}
        } else {
          // Simulated: random fluctuation
          const fluctuation = Math.floor(Math.random() * 200) - 100;
          const newCount = Math.max(0, (s.viewer_count || 0) + fluctuation);
          runSql("UPDATE streams SET viewer_count = ? WHERE id = ?", [newCount, s.id]);
        }
      }
    } catch (e) {}
  }, 30000);
}


async function startServer() {
  await initDb();
  
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const server = http.createServer(app);
  
  // WebSocket setup
  const wss = new WebSocketServer({ server });
  
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "WELCOME", payload: "Connected to StreamManager WS" }));
  });

  const broadcast = (event: string, payload: any) => {
    const msg = JSON.stringify({ type: event, payload });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  app.use(cors());
  app.use(express.json());

  // --- ACCOUNT ENDPOINTS --- //

  app.get("/api/accounts", (req, res) => {
    const user = queryOne("SELECT id FROM users LIMIT 1");
    if (!user) return res.json([]);
    const accounts = queryAll("SELECT * FROM youtube_accounts WHERE user_id = ?", [(user as any).id]);
    res.json(accounts);
  });

  app.get("/api/accounts/:accountId", (req, res) => {
    const { accountId } = req.params;
    const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [accountId]);
    if (!account) return res.status(404).json({ error: "Account not found" });
    res.json(account);
  });

  app.post("/api/accounts", (req, res) => {
    const user = queryOne("SELECT id FROM users LIMIT 1") as any;
    if (!user) return res.status(500).json({ error: "No user found" });
    
    const { name, youtubeChannelId, avatar } = req.body;
    const id = uuidv4();
    runSql(`INSERT INTO youtube_accounts (id, user_id, youtube_channel_id, name, avatar) VALUES (?, ?, ?, ?, ?)`, [
      id, user.id, youtubeChannelId || "UC_" + uuidv4().slice(0, 8), name || "New Account", avatar || ""
    ]);
    const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [id]);
    broadcast("ACCOUNT_ADDED", account);
    res.json(account);
  });

  app.put("/api/accounts/:accountId", (req, res) => {
    const { accountId } = req.params;
    const { name, avatar } = req.body;
    if (name !== undefined) runSql("UPDATE youtube_accounts SET name = ? WHERE id = ?", [name, accountId]);
    if (avatar !== undefined) runSql("UPDATE youtube_accounts SET avatar = ? WHERE id = ?", [avatar, accountId]);
    const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [accountId]);
    res.json(account);
  });

  app.delete("/api/accounts/:accountId", (req, res) => {
    const { accountId } = req.params;
    const channels = queryAll("SELECT id FROM tracked_channels WHERE account_id = ?", [accountId]);
    for (const ch of channels) {
      runSql("DELETE FROM mirroring_jobs WHERE source_stream_id IN (SELECT id FROM streams WHERE tracked_channel_id = ?)", [(ch as any).id]);
      runSql("DELETE FROM streams WHERE tracked_channel_id = ?", [(ch as any).id]);
    }
    runSql("DELETE FROM tracked_channels WHERE account_id = ?", [accountId]);
    runSql("DELETE FROM youtube_accounts WHERE id = ?", [accountId]);
    broadcast("ACCOUNT_REMOVED", { id: accountId });
    res.json({ success: true });
  });

  // --- OAUTH ENDPOINTS --- //

  // Step 1: Redirect to Google OAuth consent screen
  app.get("/api/auth/google/url", (req, res) => {
    const state = uuidv4();
    const url = getOAuthUrl(state);
    res.json({ url, state });
  });

  // Step 2: Handle OAuth callback from Google
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state, error: oauthError } = req.query;
    
    if (oauthError || !code) {
      return res.redirect(`/?oauth_error=${encodeURIComponent(String(oauthError || "no_code"))}`);
    }

    const user = queryOne("SELECT id FROM users LIMIT 1") as any;
    if (!user) return res.redirect("/?oauth_error=no_user");

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(String(code));
    if (!tokens || !tokens.access_token) {
      return res.redirect("/?oauth_error=token_exchange_failed");
    }

    // Get the user's channels
    const channels = await listMyChannels(tokens.access_token);
    if (channels.length === 0) {
      return res.redirect("/?oauth_error=no_channels_found");
    }

    // Create an account entry for EACH channel
    const addedNames: string[] = [];
    for (const ch of channels) {
      const existing = queryOne("SELECT id FROM youtube_accounts WHERE youtube_channel_id = ?", [ch.id]) as any;
      if (existing) {
        // Update tokens for existing account
        runSql("UPDATE youtube_accounts SET oauth_tokens = ?, name = ?, avatar = ?, subscriber_count = ? WHERE id = ?", [
          JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in }),
          ch.name, ch.avatar, ch.subscriberCount, existing.id
        ]);
        const updated = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [existing.id]);
        broadcast("ACCOUNT_ADDED", updated);
        addedNames.push(ch.name + " (updated)");
      } else {
        const accountId = uuidv4();
        runSql(`INSERT INTO youtube_accounts (id, user_id, youtube_channel_id, oauth_tokens, name, avatar, subscriber_count) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
          accountId, user.id, ch.id,
          JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in }),
          ch.name, ch.avatar, ch.subscriberCount
        ]);
        const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [accountId]);
        broadcast("ACCOUNT_ADDED", account);
        addedNames.push(ch.name);
      }
    }

    // Redirect back to frontend
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.redirect(`${appUrl}/?oauth_success=${encodeURIComponent(addedNames.join(", "))}`);
  });

  // Step 3: Exchange a refresh token for a new access token
  app.post("/api/auth/refresh", (req, res) => {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: "accountId required" });
    
    const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [accountId]) as any;
    if (!account) return res.status(404).json({ error: "Account not found" });

    const tokens = JSON.parse(account.oauth_tokens || "{}");
    if (!tokens.refresh_token) return res.status(400).json({ error: "No refresh token" });

    refreshAccessToken(tokens.refresh_token).then(async (newTokens) => {
      if (!newTokens) return res.status(500).json({ error: "Refresh failed" });
      
      const updatedTokens = { ...tokens, access_token: newTokens.access_token, expires_in: newTokens.expires_in };
      runSql("UPDATE youtube_accounts SET oauth_tokens = ? WHERE id = ?", [JSON.stringify(updatedTokens), accountId]);
      res.json({ success: true, access_token: newTokens.access_token });
    });
  });

  // --- LINK RESOLVE ENDPOINT --- //

  // Resolve a YouTube URL — detects channel vs video, adds to tracking or starts mirroring
  app.post("/api/links/resolve", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: "URL is required" });

      let videoId = "";
      let channelHandle = "";

      // Parse video URL: youtube.com/watch?v=VIDEO_ID or youtu.be/VIDEO_ID
      if (url.includes("watch?v=")) {
        videoId = url.split("watch?v=")[1]?.split("&")[0]?.split("/")[0] || "";
      } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1]?.split("?")[0] || "";
      } else if (url.includes("/shorts/")) {
        videoId = url.split("/shorts/")[1]?.split("?")[0] || "";
      }

      // Parse channel URL: youtube.com/@handle or /channel/UC...
      if (url.includes("youtube.com/@")) {
        channelHandle = url.split("youtube.com/@")[1]?.split("/")[0]?.split("?")[0] || "";
      } else if (url.includes("/channel/")) {
        channelHandle = url.split("/channel/")[1]?.split("/")[0]?.split("?")[0] || "";
      }

      // If it's a video link
      if (videoId) {
        const video = await getVideoInfo(videoId);
        if (!video || !video.exists) {
          return res.status(404).json({ error: "Video not found" });
        }

        // Auto-select first account
        const firstAccount = queryOne("SELECT id FROM youtube_accounts LIMIT 1") as any;
        const accountId = firstAccount?.id;

        // Find or create a tracked channel for this video's channel
        let channelId = "";
        if (video.channelId) {
          const existing = queryOne("SELECT id FROM tracked_channels WHERE channel_id = ?", [video.channelId]) as any;
          if (existing) {
            channelId = existing.id;
          } else if (accountId) {
            const newId = uuidv4();
            runSql("INSERT INTO tracked_channels (id, account_id, channel_id, channel_name, auto_monitor, auto_mirror) VALUES (?, ?, ?, ?, ?, ?)",
              [newId, accountId, video.channelId, video.channelName || "Unknown", 0, 0]);
            channelId = newId;
          }
        }

        // Create stream entry and start mirroring
        if (channelId || video.channelId) {
          const streamId = uuidv4();
          runSql(
            `INSERT INTO streams (id, source_stream_id, tracked_channel_id, title, thumbnail, status, stream_type, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [streamId, videoId, channelId || "unassigned", video.title, video.thumbnail, "MIRRORING", "16:9", video.viewCount, new Date().toISOString()]
          );

          // Create mirroring job
          const jobId = uuidv4();
          let targetBroadcastId = "local_" + uuidv4().slice(0, 8);
          let ingestUrl = "";
          let streamName = "";

          if (accountId) {
            const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [accountId]) as any;
            if (account) {
              const tokens = JSON.parse(account.oauth_tokens || "{}");
              let accessToken = tokens.access_token;
              if (tokens.refresh_token && !accessToken) {
                const refreshed = await refreshAccessToken(tokens.refresh_token);
                if (refreshed) accessToken = refreshed.access_token;
              }
              if (accessToken) {
                const bc = await createBroadcast(accessToken, { title: video.title, type: "16:9" });
                if (bc) { targetBroadcastId = bc.broadcastId; ingestUrl = bc.ingestUrl; streamName = bc.streamName; }
              }
            }
          }

          runSql("INSERT INTO mirroring_jobs (id, account_id, source_stream_id, target_broadcast_id, status, started_at, ingest_url, stream_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [jobId, accountId || "none", streamId, targetBroadcastId, "active", new Date().toISOString(), ingestUrl, streamName]);

          const newStream = queryOne(`SELECT s.*, c.channel_name FROM streams s LEFT JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]);
          broadcast("STREAM_DETECTED", newStream);
          broadcast("MIRRORING_STARTED", { stream: newStream, jobId });

          return res.json({ type: "video", stream: newStream, jobId, targetBroadcastId, ingestUrl, streamName });
        }

        return res.json({ type: "video", video, message: "Video found. Connect an account to mirror." });
      }

      // If it's a channel link
      if (channelHandle) {
        const resolved = await resolveChannel(channelHandle);
        if (!resolved) return res.status(404).json({ error: "Channel not found" });

        const firstAccount = queryOne("SELECT id FROM youtube_accounts LIMIT 1") as any;
        if (!firstAccount) return res.json({ type: "channel", channel: resolved, message: "Channel found. Connect an account to track." });

        // Add to tracked channels
        const existing = queryOne("SELECT id FROM tracked_channels WHERE channel_id = ?", [resolved.channelId]) as any;
        if (existing) return res.json({ type: "channel", channel: resolved, message: "Already tracked", id: existing.id });

        const newId = uuidv4();
        runSql("INSERT INTO tracked_channels (id, account_id, channel_id, channel_name, channel_avatar, auto_monitor, auto_mirror) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [newId, firstAccount.id, resolved.channelId, resolved.name, resolved.avatar, 1, 0]);
        const newChannel = queryOne("SELECT * FROM tracked_channels WHERE id = ?", [newId]);
        broadcast("CHANNEL_ADDED", newChannel);

        // Immediately check for live streams
        getChannelLiveStreams(resolved.channelId).then(streams => {
          for (const ls of streams) {
            const existing = queryOne("SELECT id FROM streams WHERE source_stream_id = ?", [ls.id]) as any;
            if (existing) continue;
            const sId = uuidv4();
            runSql("INSERT INTO streams (id, source_stream_id, tracked_channel_id, title, thumbnail, status, stream_type, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [sId, ls.id, newId, ls.title, ls.thumbnail, "LIVE", "16:9", ls.viewerCount, new Date().toISOString()]);
            const stream = queryOne(`SELECT s.*, c.channel_name FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [sId]);
            if (stream) broadcast("STREAM_DETECTED", stream);
          }
        }).catch(() => {});

        return res.json({ type: "channel", channel: resolved, id: newId });
      }

      return res.status(400).json({ error: "Could not parse URL. Use a YouTube channel or video link." });
    } catch (e) {
      console.error("Link resolve error:", e);
      res.status(500).json({ error: "Failed to resolve link" });
    }
  });

  app.get("/api/channels/:accountId", (req, res) => {
    const { accountId } = req.params;
    const channels = queryAll("SELECT * FROM tracked_channels WHERE account_id = ?", [accountId]);
    res.json(channels);
  });

  app.post("/api/channels", async (req, res) => {
    const { accountId, channelUrl, channelId, channelName, channelAvatar } = req.body;
    if (!accountId) return res.status(400).json({ error: "accountId is required" });

    let resolvedId = channelId;
    let resolvedName = channelName || "New Channel";
    let resolvedAvatar = channelAvatar || "";

    // Try to resolve via YouTube API if URL or plain text is provided
    if (channelUrl || (!channelId && !channelName)) {
      const input = channelUrl || channelId || "";
      const resolved = await resolveChannel(input);
      if (resolved) {
        resolvedId = resolved.channelId;
        resolvedName = resolved.name;
        resolvedAvatar = resolved.avatar;
      } else if (channelUrl) {
        // Fallback: parse URL manually
        let handle = "";
        if (channelUrl.includes("youtube.com/@")) {
          handle = channelUrl.split("youtube.com/@")[1]?.split("/")[0]?.split("?")[0] || "";
        } else if (channelUrl.includes("/channel/")) {
          resolvedId = channelUrl.split("/channel/")[1]?.split("/")[0]?.split("?")[0] || resolvedId;
        }
        if (handle) {
          resolvedName = handle;
          resolvedId = "UC_" + handle;
        }
      }
    }

    const id = uuidv4();
    runSql(`INSERT INTO tracked_channels (id, account_id, channel_id, channel_name, channel_avatar, auto_monitor, auto_mirror, scan_frequency, notifications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      id, accountId, resolvedId || "UC_" + uuidv4().slice(0, 8), resolvedName, resolvedAvatar, 1, 0, 5,
      JSON.stringify({ live_detected: true, mirroring_started: true, mirroring_ended: true, stream_ended: true })
    ]);
    const newChannel = queryOne("SELECT * FROM tracked_channels WHERE id = ?", [id]);
    broadcast("CHANNEL_ADDED", newChannel);

    // Immediately check for live streams on this channel
    if (process.env.YOUTUBE_API_KEY && resolvedId) {
      getChannelLiveStreams(resolvedId).then(liveStreams => {
        for (const ls of liveStreams) {
          const existing = queryOne("SELECT id FROM streams WHERE source_stream_id = ?", [ls.id]) as any;
          if (existing) continue;
          const sId = uuidv4();
          runSql(
            `INSERT INTO streams (id, source_stream_id, tracked_channel_id, title, description, thumbnail, status, stream_type, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sId, ls.id, id, ls.title, ls.description || "", ls.thumbnail, "LIVE", "16:9", ls.viewerCount, ls.startedAt || new Date().toISOString()]
          );
          const stream = queryOne(`SELECT s.*, c.channel_name, c.channel_avatar FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [sId]);
          broadcast("STREAM_DETECTED", stream);
        }
      }).catch(() => {});
    }

    res.json(newChannel);
  });

  app.put("/api/channels/:channelId", (req, res) => {
    const { channelId } = req.params;
    const { autoMonitor, autoMirror, scanFrequency, notifications } = req.body;
    
    if (autoMonitor !== undefined) runSql("UPDATE tracked_channels SET auto_monitor = ? WHERE id = ?", [autoMonitor ? 1 : 0, channelId]);
    if (autoMirror !== undefined) runSql("UPDATE tracked_channels SET auto_mirror = ? WHERE id = ?", [autoMirror ? 1 : 0, channelId]);
    if (scanFrequency !== undefined) runSql("UPDATE tracked_channels SET scan_frequency = ? WHERE id = ?", [scanFrequency, channelId]);
    if (notifications !== undefined) runSql("UPDATE tracked_channels SET notifications = ? WHERE id = ?", [JSON.stringify(notifications), channelId]);
    
    const channel = queryOne("SELECT * FROM tracked_channels WHERE id = ?", [channelId]);
    broadcast("CHANNEL_UPDATED", channel);
    res.json(channel);
  });

  app.delete("/api/channels/:channelId", (req, res) => {
    const { channelId } = req.params;
    runSql("UPDATE mirroring_jobs SET status = 'ended', ended_at = ? WHERE source_stream_id IN (SELECT id FROM streams WHERE tracked_channel_id = ?) AND status = 'active'", [new Date().toISOString(), channelId]);
    runSql("UPDATE streams SET status = 'ENDED' WHERE tracked_channel_id = ? AND status IN ('LIVE', 'MIRRORING')", [channelId]);
    runSql("DELETE FROM tracked_channels WHERE id = ?", [channelId]);
    broadcast("CHANNEL_REMOVED", { id: channelId });
    res.json({ success: true });
  });

  // --- STREAM ENDPOINTS --- //

  app.get("/api/streams/:accountId", (req, res) => {
    const { accountId } = req.params;
    const streams = queryAll(
      `SELECT s.*, c.channel_name, c.channel_avatar, c.account_id
       FROM streams s
       JOIN tracked_channels c ON s.tracked_channel_id = c.id
       WHERE c.account_id = ?
       ORDER BY s.started_at DESC`, [accountId]
    );
    res.json(streams);
  });

  app.post("/api/streams/:streamId/mirror", async (req, res) => {
    const { streamId } = req.params;
    const stream = queryOne(
      `SELECT s.*, c.account_id FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]
    ) as any;
    
    if (!stream) return res.status(404).json({ error: "Stream not found" });

    const jobId = uuidv4();
    let targetBroadcastId = "local_" + uuidv4().slice(0, 8);
    let ingestUrl = "";
    let streamName = "";

    // Try real broadcast creation via YouTube API
    const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [stream.account_id]) as any;
    if (account) {
      const tokens = JSON.parse(account.oauth_tokens || "{}");
      let accessToken = tokens.access_token;

      // Refresh token if expired
      if (tokens.refresh_token && !tokens.access_token) {
        const refreshed = await refreshAccessToken(tokens.refresh_token);
        if (refreshed) {
          accessToken = refreshed.access_token;
          const updatedTokens = { ...tokens, access_token: refreshed.access_token };
          runSql("UPDATE youtube_accounts SET oauth_tokens = ? WHERE id = ?", [JSON.stringify(updatedTokens), account.id]);
        }
      }

      if (accessToken) {
        const result = await createBroadcast(accessToken, {
          title: stream.title || "Live Stream",
          description: stream.description || "",
          type: stream.stream_type || "16:9",
        });
        if (result) {
          targetBroadcastId = result.broadcastId;
          ingestUrl = result.ingestUrl;
          streamName = result.streamName;
        }
      }
    }

    runSql("INSERT INTO mirroring_jobs (id, account_id, source_stream_id, target_broadcast_id, status, started_at, ingest_url, stream_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      jobId, stream.account_id, streamId, targetBroadcastId, "active", new Date().toISOString(), ingestUrl, streamName
    ]);
    runSql("UPDATE streams SET status = 'MIRRORING' WHERE id = ?", [streamId]);
    const updatedStream = queryOne(
      `SELECT s.*, c.channel_name, c.channel_avatar, c.account_id FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]
    );
    
    broadcast("STREAM_UPDATED", updatedStream);
    broadcast("MIRRORING_STARTED", { stream: updatedStream, jobId, ingestUrl, streamName });
    res.json({ success: true, stream: updatedStream, jobId, targetBroadcastId, ingestUrl, streamName });
  });

  // Mirror a specific stream from search results (by source YouTube video ID)
  app.post("/api/streams/search-mirror", async (req, res) => {
    let accountId: string | undefined, channelId: string | undefined, sourceStreamId: string | undefined, title: string | undefined, channelName: string | undefined;
    try {
    let body: any = req.body;
    accountId = body.accountId;
    channelId = body.channelId;
    sourceStreamId = body.sourceStreamId;
    title = body.title;
    channelName = body.channelName;
    if (!sourceStreamId) {
      return res.status(400).json({ error: "sourceStreamId is required" });
    }
    sourceStreamId = String(sourceStreamId);
    title = String(title || "Live Stream");
    channelName = String(channelName || "Unknown Channel");

    // Auto-select first available account if none specified
    if (!accountId) {
      const firstAccount = queryOne("SELECT id FROM youtube_accounts LIMIT 1") as any;
      if (firstAccount) accountId = firstAccount.id;
    }

    // If no channelId, try to find a matching tracked channel or use first account's channels
    if (!channelId) {
      if (accountId) {
        const firstChannel = queryOne("SELECT id FROM tracked_channels WHERE account_id = ? LIMIT 1", [accountId]) as any;
        if (firstChannel) channelId = firstChannel.id;
      }
      // Still no channelId — create a temporary untracked channel entry
      if (!channelId) {
        const tempId = uuidv4();
        runSql(
          `INSERT INTO tracked_channels (id, account_id, channel_id, channel_name, auto_monitor, auto_mirror, scan_frequency, notifications) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [tempId, accountId || "none", "UC_temp_" + tempId.slice(0, 8), channelName || "Unknown Channel", 0, 0, 5, "{}"]
        );
        channelId = tempId;
      }
    }

    // Check if stream already exists for this video ID
    let stream = queryOne("SELECT * FROM streams WHERE source_stream_id = ?", [sourceStreamId]) as any;
    
    if (!stream) {
      // Create a new stream entry with the real YouTube video ID
      const streamId = uuidv4();
      const thumbnail = `https://i.ytimg.com/vi/${sourceStreamId}/hqdefault.jpg`;
      runSql(
        `INSERT INTO streams (id, source_stream_id, tracked_channel_id, title, description, thumbnail, status, stream_type, viewer_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [streamId, String(sourceStreamId), String(channelId), String(title), "", String(thumbnail), "LIVE", "16:9", 0, new Date().toISOString()]
      );
      stream = queryOne("SELECT * FROM streams WHERE id = ?", [streamId]) as any;
    }

    if (stream.status === 'MIRRORING') {
      return res.json({ success: true, message: "Already mirroring", stream });
    }

    // Start mirroring with real broadcast creation
    const jobId = uuidv4();
    let targetBroadcastId = "local_" + uuidv4().slice(0, 8);
    let ingestUrl = "";
    let streamName = "";

    const account = accountId ? queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [String(accountId)]) as any : null;
    if (account) {
      const tokens = JSON.parse(account.oauth_tokens || "{}");
      let accessToken = tokens.access_token;
      if (tokens.refresh_token && !accessToken) {
        const refreshed = await refreshAccessToken(tokens.refresh_token);
        if (refreshed) {
          accessToken = refreshed.access_token;
          runSql("UPDATE youtube_accounts SET oauth_tokens = ? WHERE id = ?", [JSON.stringify({ ...tokens, access_token: refreshed.access_token }), account.id]);
        }
      }
      if (accessToken) {
        const result = await createBroadcast(accessToken, {
          title: title || "Live Stream",
          description: "",
          type: "16:9",
        });
        if (result) {
          targetBroadcastId = result.broadcastId;
          ingestUrl = result.ingestUrl;
          streamName = result.streamName;
        }
      }
    }

    runSql("INSERT INTO mirroring_jobs (id, account_id, source_stream_id, target_broadcast_id, status, started_at, ingest_url, stream_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      jobId, String(accountId || "none"), String(stream.id), String(targetBroadcastId), "active", new Date().toISOString(), String(ingestUrl || ""), String(streamName || "")
    ]);
    runSql("UPDATE streams SET status = 'MIRRORING' WHERE id = ?", [stream.id]);

    const updatedStream = queryOne(
      `SELECT s.*, c.channel_name, c.channel_avatar, c.account_id FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [stream.id]
    );
    broadcast("STREAM_UPDATED", updatedStream);
    broadcast("MIRRORING_STARTED", { stream: updatedStream, jobId, ingestUrl, streamName });
    res.json({ success: true, stream: updatedStream, jobId, targetBroadcastId });
    } catch (e) {
      console.error("search-mirror error:", e);
      console.error("Variables:", { accountId, channelId, sourceStreamId, title, channelName });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/streams/:streamId/stop", async (req, res) => {
    const { streamId } = req.params;

    // End the broadcast via YouTube API if it was a real broadcast
    const job = queryOne("SELECT * FROM mirroring_jobs WHERE source_stream_id = ? AND status = 'active'", [streamId]) as any;
    if (job && job.target_broadcast_id && !job.target_broadcast_id.startsWith("local_")) {
      const account = queryOne("SELECT * FROM youtube_accounts WHERE id = ?", [job.account_id]) as any;
      if (account) {
        const tokens = JSON.parse(account.oauth_tokens || "{}");
        if (tokens.access_token) {
          await endBroadcast(tokens.access_token, job.target_broadcast_id);
        }
      }
    }

    runSql("UPDATE mirroring_jobs SET status = 'ended', ended_at = ? WHERE source_stream_id = ? AND status = 'active'", [new Date().toISOString(), streamId]);
    runSql("UPDATE streams SET status = 'ENDED' WHERE id = ?", [streamId]);
    const stream = queryOne(
      `SELECT s.*, c.channel_name, c.channel_avatar, c.account_id FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE s.id = ?`, [streamId]
    );
    
    broadcast("STREAM_UPDATED", stream);
    broadcast("MIRRORING_STOPPED", { stream });
    res.json({ success: true, stream });
  });

  // --- SEARCH ENDPOINT --- //

  app.get("/api/search", async (req, res) => {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) return res.json({ channels: [], streams: [] });

    const results = await searchYouTube(q);
    res.json(results);
  });

  // --- MIRRORING JOBS ENDPOINTS --- //

  app.get("/api/mirroring-jobs/:accountId", (req, res) => {
    const { accountId } = req.params;
    const jobs = queryAll(
      `SELECT mj.*, s.title as stream_title, s.thumbnail as stream_thumbnail
       FROM mirroring_jobs mj
       LEFT JOIN streams s ON mj.source_stream_id = s.id
       WHERE mj.account_id = ?
       ORDER BY mj.started_at DESC
       LIMIT 50`, [accountId]
    );
    res.json(jobs);
  });

  app.get("/api/stats/:accountId", (req, res) => {
    const { accountId } = req.params;
    const trackedChannels = (queryOne("SELECT COUNT(*) as count FROM tracked_channels WHERE account_id = ?", [accountId]) as any).count;
    const activeMirrors = (queryOne("SELECT COUNT(*) as count FROM mirroring_jobs WHERE account_id = ? AND status = 'active'", [accountId]) as any).count;
    const activeStreams = (queryOne(
      "SELECT COUNT(*) as count FROM streams s JOIN tracked_channels c ON s.tracked_channel_id = c.id WHERE c.account_id = ? AND s.status IN ('LIVE', 'MIRRORING')", [accountId]
    ) as any).count;
    const autoChannels = (queryOne(
      "SELECT COUNT(*) as count FROM tracked_channels WHERE account_id = ? AND (auto_monitor = 1 OR auto_mirror = 1)", [accountId]
    ) as any).count;

    res.json({ trackedChannels, activeMirrors, activeStreams, autoChannels });
  });

  // Start background worker
  startBackgroundWorker(broadcast);

  // --- VITE MIDDLEWARE --- //
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
