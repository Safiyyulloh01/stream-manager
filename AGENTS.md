# Stream Manager — Agent Guide

## What This Is

A **YouTube live stream mirroring dashboard** — monitor channels, detect live streams, and relay ("mirror") them to connected YouTube accounts. Single-page React app + Express server with WebSocket real-time updates and SQLite (sql.js) persistence. Generated from Google AI Studio.

---

## Essential Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (Vite HMR + Express API + WebSocket + SQLite). Uses `tsx` to run `server.ts` directly. Server binds to `0.0.0.0:3000` by default. |
| `npm run build` | `vite build` (frontend) + `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` (backend) |
| `npm start` | Run production build from `dist/` |
| `npm run lint` | `tsc --noEmit` — type-check only, no linter/formatter |
| `npm run clean` | Remove `dist/` and `server.js` |
| `npm run preview` | `vite preview` |

No test framework or test files exist. There is a background worker that simulates live stream detection, auto-mirroring, and stream ending every 10-15 seconds.

---

## Architecture

```
server.ts              ← Express + Vite dev middleware + WebSocket + sql.js (in-browser SQLite)
src/
  main.tsx             ← React entry, renders <App/>
  App.tsx              ← Root layout: Topbar + Sidebar + Dashboard + Toaster
  store.ts             ← Zustand store (global state, all API calls, WS handler, optimistic updates)
  types.ts             ← TypeScript types (YouTubeAccount, TrackedChannel, YouTubeStream, MirroringJob, SearchResult, Stats, AppState)
  index.css            ← Tailwind v4 (CSS-first config), custom dark theme
  lib/utils.ts         ← cn() helper (clsx + tailwind-merge)
  components/
    Topbar.tsx         ← Header: live YouTube search (debounced, dropdown), account switcher, add/remove accounts
    Sidebar.tsx        ← Nav sidebar + tracked channels list with auto-monitor/auto-mirror badges + mobile drawer
    Dashboard.tsx      ← Stats cards (fetched from /api/stats) + live stream feed grid (StreamCard[])
    StreamCard.tsx     ← Stream card with thumbnail, status badge, mirror controls, stop confirmation dialog
    ui/                ← ~15 shadcn/ui components (base-ui/react primitives)
```

### Data Flow

1. **On mount**: `App.tsx` calls `initFetch()` → fetches `/api/accounts`, then channels, streams, mirroring jobs, stats for the active account.
2. **State**: All state in Zustand store. Actions optimistically update local state then `fetch()` to `/api/*`.
3. **Server**: Express routes persist to SQLite, then broadcast changes via WebSocket.
4. **WebSocket**: Client reconnects automatically on close. Handles `STREAM_DETECTED`, `STREAM_UPDATED`, `STREAM_ENDED`, `CHANNEL_ADDED`, `CHANNEL_UPDATED`, `CHANNEL_REMOVED`, `ACCOUNT_ADDED`, `ACCOUNT_REMOVED`, `MIRRORING_STARTED`, `MIRRORING_STOPPED`.
5. **Background worker** (server-side): Every 15s scans auto-monitored channels for new live streams (simulated). Every 10s checks for stream ending (simulates end after 2-5 minutes). Every 8s fluctuates viewer counts.
6. **Auto-mirror**: If `auto_mirror` is enabled on a channel, detected streams automatically start mirroring + create a mirroring job.
7. **Account isolation**: Switching accounts in the Topbar calls `setActiveAccount()` which triggers `refreshCurrentAccount()` — loads separate channels, streams, jobs for that account.

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/accounts` | List all connected accounts |
| GET | `/api/accounts/:id` | Get single account |
| POST | `/api/accounts` | Add new account |
| PUT | `/api/accounts/:id` | Update account name/avatar |
| DELETE | `/api/accounts/:id` | Remove account + all its data (cascade delete) |
| POST | `/api/auth/google` | Mock OAuth — creates a new account |
| GET | `/api/channels/:accountId` | List tracked channels for account |
| POST | `/api/channels` | Add channel (supports URL or manual channelId) |
| PUT | `/api/channels/:id` | Update channel settings (auto_monitor, auto_mirror, scan_frequency, notifications) |
| DELETE | `/api/channels/:id` | Remove channel + end its streams |
| GET | `/api/streams/:accountId` | List streams for account |
| POST | `/api/streams/:id/mirror` | Start mirroring a stream |
| POST | `/api/streams/:id/stop` | Stop mirroring (sets status to ENDED) |
| GET | `/api/search?q=...` | Search YouTube channels and streams |
| GET | `/api/mirroring-jobs/:accountId` | Get mirroring job history |
| GET | `/api/stats/:accountId` | Get dashboard statistics |

---

## Database (sql.js)

**Critical**: sql.js works differently from better-sqlite3 or other Node SQLite drivers.
- Import: `import initSqlJs from "sql.js"` then `const SQL = await initSqlJs()`
- Query helpers used: `queryAll(sql, params)`, `queryOne(sql, params)`, `runSql(sql, params)`
- DB is saved to disk via `db.export()` → `fs.writeFileSync()` after every write
- No prepared statement caching — statements are created, bound, stepped, freed per query

**Tables**: `users`, `youtube_accounts` (has `oauth_tokens` JSON), `tracked_channels` (has `scan_frequency`, `notifications` JSON), `streams` (has `viewer_count`, `started_at`), `mirroring_jobs`

---

## AI Studio Context

- `metadata.json` declares this as a "MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API" app — it has an Express backend, not just static files.
- The `index.html` at project root is the Vite entry point (not in `public/`).
- `components.json` configures shadcn/ui with the `base-nova` style, `neutral` base color, and lucide-react icons.
- HMR/file watching are intentionally disabled when `DISABLE_HMR=true` (set by AI Studio) to prevent flickering during agent edits.

---

## Key Conventions & Gotchas

### Code Style
- **React with JSX**, PascalCase filenames, `React.FC<>` type annotations
- **Zustand** single store, `create<Store>()`, `set/get` pattern
- **shadcn/ui** on `@base-ui/react` primitives (Button, Badge, Dialog, Select, etc.)
- **Tailwind CSS v4** — CSS-first via `index.css`, `@plugin "tailwindcss-animate"`, `@custom-variant dark`
- **Path aliases**: `@/` → `./src/*` (both tsconfig.json and vite.config.ts)
- **Icons**: lucide-react. **Notifications**: sonner `toast.success()` / `toast.error()`.
- **`next-themes`** is a dependency but unused — theme is hardcoded to `dark` in JSX.

### Important Patterns
- `Button variant="ghost"` for icon-only actions
- `DropdownMenu` wrapped in `DropdownMenu.Trigger` with `render` prop pattern
- `Dialog` + `AlertDialog` for modals and confirmations
- Destructive actions always have confirmation dialogs (remove channel, stop mirroring, remove account)
- Mobile sidebar: drawer overlay with `hidden md:flex` desktop + floating FAB button
- Search bar: debounced (300ms), shows results dropdown with channels and streams
- `useRender` / `mergeProps` from `@base-ui/react` for polymorphic components (Badge)

### Gotchas
1. **No tests exist**. No test runner configured.
2. **sql.js** requires async initialization — `startServer()` is async and calls `initDb()` first. The `require("sql.js").Database` fallback on line ~22 is never used but kept for clarity.
3. **DB is not auto-saved** on reads — only `runSql()` calls `saveDb()`. If the process crashes, recent writes may be lost.
4. **Mock search** — `/api/search` returns mock data, not real YouTube API results.
5. **`@google/genai`** is a dependency but never imported anywhere.
6. **`autoprefixer`** is a devDependency but Tailwind v4 uses Vite plugin — may be vestigial.
7. **`.env*` files are gitignored** (except `.env.example`). `GEMINI_API_KEY` and `APP_URL` are expected but unused.
8. **`index.css` has duplicate CSS variable definitions** — custom dark palette at top, shadcn defaults at line ~135+. The second block overrides most vars.
9. **HMR/watching disabled in AI Studio** via `DISABLE_HMR` env var.
10. **`stream_manager.db`** is created in the project root on first run, gitignored by `*.db` if added.
11. **OAuth `redirect_uri` must match Google Cloud Console exactly** — no trailing slashes, no extra paths. Defined in `.env.example` as `http://localhost:3000/api/auth/google/callback` and must match the configured URI in GCP exactly.
12. **`tsconfig.json` has `noEmit: true`** — TypeScript is type-check only. The actual runtime uses `tsx` for dev and esbuild for production bundles.
13. **`listMyChannels` in `youtube-api.ts`** tries `managedByMe=true` first, then falls back to `mine=true`. This matters because different OAuth token types return results from only one of these endpoints.
14. **Channel URL resolution** in `server.ts` (the `POST /api/channels` handler and `resolveChannel` in `youtube-api.ts`) supports `youtube.com/@handle`, `youtube.com/channel/UC...`, raw `UC...` IDs, and plain text handles. The server-side fallback (when API key is missing) just prefixes handles with `UC_`.
15. **`@fontsource-variable/geist`** is a dependency — the app uses the Geist font family (likely loaded in `index.css`).
16. **`components.json` uses `style: "base-nova"`** — shadcn/ui components were installed with the base-nova style variant, which produces slightly different component code than the default style.
17. **Background worker has two scan intervals**: 15s when no API key (no-op worker), 60s when API key is set (to avoid YouTube API rate limits).

---

## Dependencies Summary

**Key frontend**: React 19, Zustand 5, Tailwind v4, lucide-react, sonner, date-fns, motion, @base-ui/react, class-variance-authority, tailwind-merge, clsx
**Key backend**: Express 4, sql.js, ws, uuid, cors
**Infrastructure**: Vite 6 (React + Tailwind plugins), esbuild, tsx, shadcn CLI
**Unused/unnecessary**: @google/genai, next-themes, autoprefixer
