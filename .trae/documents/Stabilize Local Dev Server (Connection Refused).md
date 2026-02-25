## Goal
Restore access to the app at `http://localhost:5173/` by ensuring the dev server runs and binds correctly on your machine.

## Checks & Fixes (No data changes)
1. Verify configuration
- Confirm Vite is pinned to a fixed port and host (strictPort=true, host=true). If missing, add to `vite.config.ts` and rebuild.
2. Start the dev server
- Run `npm run dev -- --host` and watch for the Local URL output.
- If port 5173 is busy or blocked, re-run on `5174` with `npm run dev -- --port 5174 --strictPort --host`.
3. Use the network URL
- If `localhost` is blocked, use the Network URL printed by Vite (e.g., `http://<LAN-IP>:5173/`).
4. Firewall/proxy
- Allow `node.exe` and `vite` in firewall; temporarily disable VPN/proxy. Retry the Local URL.
5. Verify route serving
- Confirm the root route renders and `vercel.json` rewrites are correct for preview. Ensure `index.html` serves.

## Validation
- After starting, open the Local URL and confirm the dashboard loads.
- If necessary, I’ll switch to an alternate port and share that URL.

## Acceptance Criteria
- Local server starts and serves without `ERR_CONNECTION_REFUSED`.
- The dashboard renders reliably at the printed Local URL.
- No code changes beyond config needed; safe to keep running during development.