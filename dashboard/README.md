# pitmhskills dashboard

Local console for the skill router. Binds to 127.0.0.1 only. No accounts, no network at runtime.

## Run
```
cd dashboard
npm install
npm run start      # build web + serve on http://127.0.0.1:4317
npm run dev        # rebuild on change + restart server on change
npm run check      # typecheck + build + smoke + line caps
```
Needs Node 23.6 or newer (the server runs TypeScript directly) and Bun on PATH (the router runs on Bun).
Set `PORT` to change the port.

## Layout
- `server/adapter/` the only code that knows the repo (cards, router CLI, validator, eval files, AGENTS.md)
- `server/core/` audit, changelog (write protocol arrives in S3)
- `server/routes/` one file per resource
- `web/src/features/` one folder per screen; `web/src/ui/` primitives; `web/src/styles/tokens.css` design tokens
- `.state/` (gitignored) token, history, changelog, caches

## Status
See `PROGRESS.md` (slices), `RECON.md` (flags and evidence), `ROUTING_LOG.md` (design skill routing).
