/**
 * YouTube service using youtubei.js (InnerTube — no API key needed, no quota limits)
 * for search, channel resolution, and live stream detection.
 * YouTube Data API is only used for OAuth flows and broadcast management
 * (which require OAuth tokens, not API key).
 */

import Innertube from 'youtubei.js';
import { v4 as uuidv4 } from "uuid";

let _yt: any = null;
async function getYT() {
  if (!_yt) _yt = await Innertube.create();
  return _yt;
}

function fixUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

// ==================== SEARCH ====================

export interface YTSearchChannel {
  id: string; name: string; avatar: string; subscriberCount: string;
}
export interface YTSearchStream {
  id: string; title: string; channelName: string; channelId: string;
  thumbnail: string; viewerCount: number; status: "LIVE" | "MIRRORING" | "ENDED"; type: "16:9" | "9:16";
}
export interface YTSearchResult { channels: YTSearchChannel[]; streams: YTSearchStream[]; }

export async function searchYouTube(query: string): Promise<YTSearchResult> {
  const result: YTSearchResult = { channels: [], streams: [] };
  try {
    const yt = await getYT();

    // Channels
    const chSearch: any = await yt.search(query, { type: 'channel' });
    if (chSearch.channels) {
      for (const ch of chSearch.channels) {
        const author = ch.author || {};
        const thumbnails = author.thumbnails || [];
        const subs = (ch.video_count?.text || '').replace(' subscribers', '');
        result.channels.push({
          id: author.id || ch.endpoint?.payload?.browseId || '',
          name: author.name || '',
          avatar: fixUrl(thumbnails[0]?.url || ''),
          subscriberCount: subs || '—',
        });
      }
    }

    // Live streams — search with features: ['live'] (reliable LIVE badge filter)
    try {
      const search: any = await yt.search(query, { type: 'video', features: ['live' as any] });
      if (search.videos) {
        // Fetch viewer counts in parallel for all live results
        const viewerCounts = new Map<string, number>();
        await Promise.all((search.videos as any[]).map(async (v: any) => {
          const vid = v.id || v.video_id;
          if (!vid) return;
          try {
            const info: any = await yt.getInfo(vid);
            viewerCounts.set(vid, info.basic_info?.view_count || 0);
          } catch {}
        }));

        for (const v of search.videos) {
          const vid = v.id || v.video_id;
          const author = v.author || {};
          const thumbnails = v.thumbnails || [];
          result.streams.push({
            id: vid || '',
            title: v.title?.text || '',
            channelName: author.name || '',
            channelId: author.id || author.channel_id || author.endpoint?.payload?.browseId || '',
            thumbnail: fixUrl(thumbnails[0]?.url || ''),
            viewerCount: viewerCounts.get(vid) || 0,
            status: "LIVE",
            type: "16:9",
          });
        }
      }
    } catch {}

  } catch (e) { console.error("InnerTube search error:", e); }
  return result;
}

// ==================== CHANNEL RESOLUTION ====================

export async function resolveChannel(input: string): Promise<{
  channelId: string; name: string; avatar: string; subscriberCount: string;
} | null> {
  try {
    let handle = "", channelId = "";
    if (input.includes("youtube.com/@")) handle = input.split("youtube.com/@")[1]?.split("/")[0]?.split("?")[0] || "";
    else if (input.includes("/channel/")) channelId = input.split("/channel/")[1]?.split("/")[0]?.split("?")[0] || "";
    else if (input.startsWith("UC")) channelId = input;
    else handle = input;

    const yt = await getYT();
    if (channelId) {
      const info: any = await yt.getChannel(channelId);
      if (info?.metadata) return {
        channelId, name: info.metadata.title || channelId,
        avatar: fixUrl(info.metadata.avatar?.[0]?.url || info.metadata.thumbnail?.[0]?.url || ''),
        subscriberCount: info.header?.content?.subscriber_count?.text || info.header?.content?.subscriber_count?.toString?.() || '—',
      };
    }
    if (handle) {
      const search: any = await yt.search(handle, { type: 'channel' });
      if (search.channels?.[0]) {
        const ch = search.channels[0];
        const author = ch.author || {};
        const thumbnails = author.thumbnails || [];
        const subs = (ch.video_count?.text || '').replace(' subscribers', '');
        return {
          channelId: author.id || ch.endpoint?.payload?.browseId || '',
          name: author.name || handle,
          avatar: fixUrl(thumbnails[0]?.url || ''),
          subscriberCount: subs || '—',
        };
      }
    }
    return null;
  } catch (e) { console.error("resolve error:", e); return null; }
}

// ==================== CHANNEL LIVE STREAMS ====================

export async function getChannelLiveStreams(channelId: string): Promise<any[]> {
  try {
    const yt = await getYT();
    const results: any[] = [];
    const processedIds = new Set<string>();

    const extract = (videos: any[], skipBadge = false) => {
      for (const v of videos || []) {
        const vid = v.id || v.video_id || '';
        if (!vid || processedIds.has(vid)) continue;
        processedIds.add(vid);
        if (!skipBadge) {
          const badges = v.badges || [];
          const isLive = badges.some((b: any) => (b.text === 'LIVE' || b.label === 'LIVE' || b.style === 'BADGE_STYLE_TYPE_LIVE_NOW'));
          if (!isLive) continue;
        }
        const author = v.author || {};
        const thumbnails = v.thumbnails || [];
        results.push({
          id: vid, title: v.title?.text || '', description: '',
          thumbnail: fixUrl(thumbnails[0]?.url || ''), channelId,
          viewerCount: parseInt(String(v.view_count?.text || '0').replace(/[^0-9]/g, '')) || 0,
          startedAt: new Date().toISOString(),
        });
      }
    };

    // Search with features: ['live'] (reliable LIVE filter)
    try {
      const search: any = await yt.search(channelId, { type: 'video', features: ['live' as any] });
      extract(search.videos, true);
    } catch {}
    if (results.length > 0) return results;

    // Fallback: search with channel tag
    try {
      const search: any = await yt.search(channelId + ' live', { type: 'video' });
      extract(search.videos);
    } catch {}

    return results;
  } catch (e) { console.error("channel live error:", e); return []; }
}

/** Get video info — works for live, ended, and regular videos. */
export async function getVideoInfo(videoId: string): Promise<{
  title: string; channelId: string; channelName: string;
  isLive: boolean; isUpcoming: boolean; viewCount: number;
  thumbnail: string; exists: boolean; duration: number; // duration in seconds
} | null> {
  try {
    const yt = await getYT();
    const info: any = await yt.getInfo(videoId);
    if (!info?.basic_info) return { title: '', channelId: '', channelName: '', isLive: false, isUpcoming: false, viewCount: 0, thumbnail: '', exists: false, duration: 0 };
    const bi = info.basic_info;
    return {
      title: bi.title || '',
      channelId: bi.channel_id || bi.channel?.id || '',
      channelName: bi.author || bi.channel?.name || '',
      isLive: !!bi.is_live,
      isUpcoming: !!bi.is_upcoming,
      viewCount: bi.view_count || 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      exists: true,
      duration: bi.duration || 0,
    };
  } catch (e) {
    return { title: '', channelId: '', channelName: '', isLive: false, isUpcoming: false, viewCount: 0, thumbnail: '', exists: false, duration: 0 };
  }
}

// ==================== OAUTH (YouTube Data API) ====================

function cfg() {
  return {
    clientId: process.env.OAUTH_CLIENT_ID || "",
    clientSecret: process.env.OAUTH_CLIENT_SECRET || "",
    redirectUri: process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback",
  };
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/userinfo.email",
];

const YT_API = "https://www.googleapis.com/youtube/v3";

export function getOAuthUrl(state: string): string {
  const c = cfg();
  const p = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, scope: SCOPES.join(" "), response_type: "code", access_type: "offline", prompt: "consent", state });
  return `https://accounts.google.com/o/oauth2/auth?${p.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token: string | null; expires_in: number } | null> {
  const c = cfg();
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: "authorization_code" }),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const c = cfg();
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" }),
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function listMyChannels(accessToken: string): Promise<{ id: string; name: string; avatar: string; subscriberCount: string }[]> {
  const results: any[] = [];
  try {
    for (const mode of ["mine=true", "managedByMe=true"]) {
      const r = await fetch(`${YT_API}/channels?part=snippet,statistics&${mode}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) { const d: any = await r.json(); if (d.items) for (const ch of d.items) if (!results.find((x: any) => x.id === ch.id)) results.push(ch); }
    }
  } catch {}
  return results.map((ch: any) => ({
    id: ch.id, name: ch.snippet?.title || "My Channel", avatar: ch.snippet?.thumbnails?.default?.url || "",
    subscriberCount: ch.statistics?.subscriberCount ? formatNum(parseInt(ch.statistics.subscriberCount)) : "0",
  }));
}

// ==================== BROADCASTS (YouTube Data API) ====================

export async function createBroadcast(accessToken: string, opts: { title: string; description?: string; type?: "16:9" | "9:16" }): Promise<{ broadcastId: string; streamId: string; ingestUrl: string; streamName: string } | null> {
  try {
    const isV = opts.type === "9:16";
    const bc: any = await (await fetch(`${YT_API}/liveBroadcasts?part=snippet,status,contentDetails`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ snippet: { title: opts.title, description: opts.description || "", scheduledStartTime: new Date().toISOString() }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false }, contentDetails: { enableAutoStart: true, enableAutoStop: true, monitorStream: { broadcastMonitorDelayMs: 0, enableMonitorStream: true } } }) })).json();
    const st: any = await (await fetch(`${YT_API}/liveStreams?part=snippet,cdn`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ snippet: { title: `Stream for ${opts.title}` }, cdn: { ingestionType: "rtmp", resolution: isV ? "720p" : "1080p", frameRate: "30fps" } }) })).json();
    await fetch(`${YT_API}/liveBroadcasts/bind?part=snippet,status,contentDetails&id=${bc.id}&streamId=${st.id}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    await fetch(`${YT_API}/liveBroadcasts/transition?broadcastStatus=testing&id=${bc.id}&part=snippet,status`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    await new Promise(r => setTimeout(r, 1000));
    await fetch(`${YT_API}/liveBroadcasts/transition?broadcastStatus=active&id=${bc.id}&part=snippet,status`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
    return { broadcastId: bc.id, streamId: st.id, ingestUrl: st.cdn?.ingestionInfo?.ingestionAddress || "", streamName: st.cdn?.ingestionInfo?.streamName || "" };
  } catch (e) { console.error("broadcast error:", e); return null; }
}

export async function endBroadcast(accessToken: string, broadcastId: string): Promise<boolean> {
  try { return (await fetch(`${YT_API}/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=snippet,status`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } })).ok; }
  catch { return false; }
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}
