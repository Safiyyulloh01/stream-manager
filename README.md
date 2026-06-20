<div align="center">
  <img src="https://api.dicebear.com/9.x/icons/svg?seed=stream-manager&backgroundColor=7AE2CF" width="80" height="80" alt="logo" />
  <h1>Stream Manager</h1>
  <p><strong>YouTube live stream mirroring dashboard</strong></p>
  <p>Monitor channels, detect live streams, and relay them to your connected YouTube accounts.</p>
</div>

---

## Features

- **YouTube Account Management** — Connect multiple YouTube accounts via Google OAuth
- **Channel Tracking** — Add channels by link, auto-detect live streams
- **Live Stream Detection** — Real-time monitoring with WebSocket updates
- **Stream Mirroring** — Mirror any video or live stream to your YouTube channel
- **Auto-Mirror** — Automatically relay detected streams with one click
- **Broadcast Management** — Create and manage YouTube broadcasts via Live API
- **Multi-Account Workspaces** — Each account has isolated channels, streams, and jobs

## Quick Start

```bash
# Clone and set up
git clone https://github.com/Safiyyulloh01/stream-manager.git
cd stream-manager
chmod +x setup.sh && ./setup.sh

# Configure credentials
# Edit .env with your YouTube API key and OAuth credentials

# Start development server
npm run dev
```

Open **http://localhost:3000** in your browser.

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key |
| `OAUTH_CLIENT_ID` | No* | Google OAuth client ID |
| `OAUTH_CLIENT_SECRET` | No* | Google OAuth client secret |
| `OAUTH_REDIRECT_URI` | No* | OAuth callback URL |

*Required for broadcast creation and account management.

## Architecture

```
server.ts              ← Express + WebSocket + SQLite
src/
├── App.tsx            ← Root layout
├── store.ts           ← Zustand state (API calls, WebSocket)
├── components/
│   ├── Topbar.tsx     ← Link input + account switcher
│   ├── Sidebar.tsx    ← Nav + tracked channels
│   ├── Dashboard.tsx  ← Stats + stream feed
│   └── StreamCard.tsx ← Stream card with mirror controls
└── lib/
    └── youtube-api.ts ← InnerTube + YouTube Data API v3 + OAuth
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/accounts` | List accounts |
| POST | `/api/accounts` | Add account |
| DELETE | `/api/accounts/:id` | Remove account |
| GET | `/api/channels/:accountId` | List tracked channels |
| POST | `/api/channels` | Add channel from link |
| GET | `/api/streams/:accountId` | List streams |
| POST | `/api/streams/:id/mirror` | Start mirroring |
| POST | `/api/streams/:id/stop` | Stop mirroring |
| POST | `/api/links/resolve` | Resolve any YouTube link |
| GET | `/api/mirroring-jobs/:accountId` | Mirroring history |
| GET | `/api/stats/:accountId` | Dashboard stats |

## Tech Stack

**Frontend**: React 19, Zustand 5, Tailwind CSS v4, lucide-react, sonner, @base-ui/react
**Backend**: Express 4, sql.js, ws, uuid
**YouTube**: youtubei.js (InnerTube), YouTube Data API v3, YouTube Live Streaming API

## Security

See [SECURITY.md](SECURITY.md) for the full audit (score: B+).

- No credentials in source — all via `.env`
- Parameterized SQL queries
- OAuth tokens stored locally
- `.gitignore` covers secrets and DB files

## License

Apache 2.0
