## Goal
Get the app serving at `http://localhost:5173/` and keep the dev server from shutting down.

## Steps
- Launch the dev server in a dedicated terminal: `npm run dev -- --host --strictPort`.
- If 5173 is blocked, run on `5174`: `npm run dev -- --port 5174 --strictPort --host`.
- Do not run other commands in that terminal; starting a new command kills the dev server.
- Use the Network URL printed by Vite (e.g., `http://<LAN-IP>:5173/`) if `localhost` is blocked.
- Verify firewall/VPN/proxy: allow `node.exe`/`vite` and disable VPN/proxy temporarily.
- Confirm config: Vite pinned port/host (strictPort/host) so it won’t auto-switch.

## Acceptance Criteria
- Dev server stays running and serves the app at the printed Local/Network URL.
- No more `ERR_CONNECTION_REFUSED` while the server is active.
- Terminal remains dedicated to the server (no accidental shutdowns).