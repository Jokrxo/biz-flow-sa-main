## Diagnosis
- Dashboard not showing on Vercel and changes missing likely due to:
  - Deployed branch mismatch (Vercel building `main` while changes are on `feature/invoice-postings`).
  - Missing/incorrect env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) in Vercel.
  - Mixed Supabase client modules (`@/lib/supabase` vs `@/integrations/supabase/client`) causing inconsistent config.
  - Auth flow calling `signOut` or failing session fetch on mount (see net::ERR_ABORTED logs), blocking data loads.
  - Non-fatal DOM nesting warning; avoid crashing render.

## Implementation Plan
1. Vercel Branch & Build
- Set Vercel Project to deploy from `feature/invoice-postings` (or merge to `main`).
- Confirm build command `npm run build` and framework Vite; output directory `dist`.

2. Environment Variables
- Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel Environment (Production/Preview) matching your Supabase project.
- If using additional RPCs, ensure no server-only keys are exposed; keep service_role server-side only.

3. Supabase Client Standardization
- Consolidate to a single client module (e.g., `@/lib/supabase`) and update imports so all components use the same initialized client.
- Remove or align `@/integrations/supabase/client` to reference the same env vars and initialization code.

4. Auth Flow Hardening
- In `AuthProvider`, avoid automatic `signOut` or logout requests on mount.
- Handle `getUser()` failures gracefully: render dashboard skeleton with fallback messaging, then retry loads.

5. UI & Data Safety
- Ensure Dashboard loads even if Supabase calls fail: wrap loads in try/catch and keep UI visible.
- Fix the DOM nesting warning in `ui/form.tsx` so markup doesn’t violate React’s nesting rules (restructure tags or replace nested `<p>` appropriately).

6. Reports and Posting Visibility
- Keep RPC postings for Sent/Paid; after posting, trigger AFS/TB refresh.
- Verify date filters use `YYYY-MM-DD` to match `DATE` fields (already aligned) so entries appear on Vercel.

7. Verification
- Deploy to Vercel with corrected branch and env; open dashboard to confirm widgets render.
- Test Sent/Paid on sample invoices; check Balance Sheet/Income Statement/Trial Balance reflect.
- Monitor Vercel logs for network/auth errors and resolve.

If you confirm, I will standardize the Supabase client usage across the app, adjust the auth flow, fix the form markup warning, and guide Vercel setup (branch and env) so the dashboard and postings are visible on your deployment.