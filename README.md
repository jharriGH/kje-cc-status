# kje-cc-status

Live status dashboard for Claude Code sessions across the King James Empire.

**URL:** https://kje-cc-status.pages.dev (and any custom domain wired later).

## What it does

Reads `brain_log` entries from Jim Brain, groups them by `session_id` tag, and
shows every active and recent CC session with its latest checkpoint. Auto-refreshes
every 30 seconds. Click a session card to expand a full ordered timeline of every
`brain_log` entry for that session.

## How to use

1. Open the URL on phone or desktop.
2. Active sessions are at the top (blue badge = running, gray = unknown).
3. Completed in the last 24h are at the bottom (green = PASS, red = FAIL).
4. Tap a card to expand its full Brain log timeline.
5. Pause auto-refresh with the Pause button if you are reading.

## Architecture

- `index.html` &mdash; single-file frontend, Tailwind CDN, vanilla JS, polls `/api/sessions` every 30s.
- `functions/api/sessions.js` &mdash; CF Pages Function. Proxies `GET /logs?limit=300` from Brain, groups by session tag, returns JSON. Holds `JIM_BRAIN_KEY` as a secret env var.
- `functions/api/session/[id].js` &mdash; CF Pages Function. Returns the full timeline of `brain_log` entries for a single session id.

The Brain API key is **never** exposed to the browser. All Brain calls happen inside the Pages Function with the secret bound at deploy time.

## Session tag convention

Sessions are detected from any tag matching:

- `CC-XXX_<hex>` (e.g. `CC-LIVE-STATUS-PAGE_79e6b52c`)
- `session_<id>` (e.g. `session_statuspg`)

Status is inferred from tags first (`complete`, `pass`, `fail`, `blocked`), then from content keywords.

## Deploy

```
wrangler pages secret put JIM_BRAIN_KEY --project-name=kje-cc-status
wrangler pages deploy . --project-name=kje-cc-status --branch=main
```

Secret value: the Brain `x-brain-key` value.
