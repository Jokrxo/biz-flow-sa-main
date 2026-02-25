## Immediate Local Visibility
- Restart the dev server to load fresh config: stop and start `npm run dev`.
- Clear cached dashboard widget settings: delete `localStorage['dashboardWidgets']` or use the Settings panel to toggle widgets back on.
- Navigate to the Dashboard route (`/`) after login; ensure you’re not stuck on Signup/Login due to auth failures.

## Client & Auth Stabilization
- Standardize Supabase client usage across the app: ensure all imports use the same initialized client (prefer `@/lib/supabase`).
- Harden AuthProvider: remove any auto sign-out on mount; handle `getUser()` failures gracefully and render the UI even if session is temporarily unavailable.
- Fix DOM nesting warnings in `ui/form.tsx` so React doesn’t choke on invalid markup.

## Build/Deploy Alignment
- Vercel builds from the correct branch (`feature/invoice-postings`) or merge into `main`.
- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel Environment to your project values (Production & Preview) so REST/auth calls succeed.
- Confirm build command (`npm run build`) and output directory (`dist`) with Vite framework selected.

## Posting Visibility Checks
- Keep Sent/Paid invoices posting via server RPCs; refresh AFS/TB after calls.
- Confirm report date filters use `YYYY-MM-DD` to include entries (already updated).
- Verify AR (1200), Bank (1100), Revenue (4000) balances appear in TB/BS/PL; zero lines remain hidden.

## Verification
- Locally: open `http://localhost:5173/`, login, go to Dashboard—verify the AR Unpaid widget and metrics render.
- Post Sent/Paid and confirm BS/PL/TB update in the selected period.
- On Vercel: once env/branch are aligned, repeat the checks and watch logs for network/auth errors.

If you confirm, I’ll standardize client imports, harden auth/UI, reset widget defaults, and guide Vercel branch/env so the dashboard and postings show both locally and on Vercel.