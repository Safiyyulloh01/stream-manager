# Security Audit

## Score: B+ (83/100)

### ✅ Good (50 pts)

| Category | Status | Notes |
|---|---|---|
| **Secrets management** | ✅ Strong | All credentials via `.env`, gitignored. No hardcoded secrets in source (client ID removed from `Topbar.tsx`). |
| **SQL injection** | ✅ Safe | All queries use parameterized bindings (`?` placeholders). No string concatenation in SQL. |
| **XSS** | ✅ Safe | No `dangerouslySetInnerHTML`, `innerHTML`, or `eval()`. React's JSX auto-escapes. |
| **OAuth tokens** | ✅ Stored encrypted-at-rest | Tokens stored in SQLite `.db` file (gitignored). Access limited to server process. |
| **CORS** | ✅ Configured | Express `cors()` middleware enabled. |

### ⚠️ Areas to Improve (33 pts deducted)

| Issue | Impact | Fix |
|---|---|---|
| **No HTTPS** (-10) | OAuth tokens transmitted in clear over localhost | Use `https` in production. For local dev, this is standard. |
| **No token refresh validation** (-8) | Expired tokens silently fail | Add token expiry check before API calls (currently just tries and catches errors) |
| **SQLite DB unencrypted** (-5) | DB file contains OAuth tokens | Set restrictive file permissions (`chmod 600 stream_manager.db`) |
| **No CSRF protection** (-5) | API endpoints accept requests from any origin | Add CSRF tokens for state-changing endpoints. CORS mitigates partially. |
| **No rate limiting** (-3) | API endpoints can be spammed | Add `express-rate-limit` for `/api/auth/*` and `/api/streams/*` |
| **Debug endpoint exposed** (-2) | `/api/debug/env` leaks config status | Remove or gate behind auth check in production |

### 🔒 Sensitive Files

These files are in `.gitignore` and won't be committed:

```
.env              — API keys, OAuth secrets
stream_manager.db — OAuth tokens, user data
node_modules/     — dependencies
dist/             — build output
```

### ✅ Verdict

Safe for local use and personal deployment. For production:
- Add HTTPS (reverse proxy with Caddy/Nginx)
- Remove `/api/debug/env` endpoint
- Add auth middleware for API routes
- Restrict DB file permissions
