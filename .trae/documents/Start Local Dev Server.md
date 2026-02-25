## Goal
Launch and keep the app running locally so you can use the new Quotes features and dashboards.

## Actions
- Start the dev server in a dedicated terminal: `npm run dev -- --host --strictPort`.
- If port 5173 is unavailable, start on `5174`: `npm run dev -- --port 5174 --strictPort --host`.
- Use the Network URL printed by Vite (e.g., `http://<LAN-IP>:5173/`) if `localhost` is blocked.
- Keep the terminal dedicated to the server; don’t run other commands in it to avoid shutdown.

## Acceptance Criteria
- The server runs and serves at the Local or Network URL.
- No `ERR_CONNECTION_REFUSED` while the server is active.
- You can open Quotes and use Send/Download without errors.