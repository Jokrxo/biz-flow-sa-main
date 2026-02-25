## Scope
Add per-quote Download (PDF) and Send (email) actions in both the Sales Quotes component and the Quotes page.

## Files
- `src/lib/quote-export.ts` (new): PDF builder utilities using `jspdf` and `jspdf-autotable`.
- `src/components/Sales/SalesQuotes.tsx`: add helpers and wire per-row actions (Download, Send).
- `src/pages/Quotes.tsx`: wire per-row actions and the page-level Export button.

## Implementation
- PDF utilities (`src/lib/quote-export.ts`):
  - Types: `QuoteForPDF`, `QuoteItemForPDF`, `CompanyForPDF`.
  - `buildQuotePDF(quote, items, company)` builds header (company name/logo), meta (quote number/date/expiry/customer), items table (description/qty/unit/tax/line total), totals (subtotal/tax/total), and notes.
  - `addLogoToPDF(doc, logoDataUrl)` and `fetchLogoDataUrl(url)` reused from invoice export or mirrored.
- Sales Quotes (`src/components/Sales/SalesQuotes.tsx`):
  - Helpers: `fetchCompanyForPDF()`, `fetchQuoteItemsForPDF(quoteId)`, `mapQuoteForPDF(quote)`.
  - Actions:
    - `handleDownloadQuote(quote)` → build PDF → `doc.save('quote_<number>.pdf')`.
    - Send dialog state: `sendDialogOpen`, `sendEmail`, `sendMessage`, `selectedQuote`.
    - `openSendDialog(quote)` pre-fills recipient and message.
    - `handleSendEmail()` builds PDF → `doc.output('blob')` → upload to Supabase Storage bucket `quotes` at `quotes/quote_<number>.pdf` (`upsert: true`) → get public URL → open mail client (`mailto:`) with subject `Quote <number>` and body including link → update quote `status: 'sent'`.
  - UI: in Actions cell add `Download` and `Mail` buttons aligned with Convert/Delete.
- Quotes page (`src/pages/Quotes.tsx`):
  - Import `quote-export` utilities and wire per-row Download/Send similarly.
  - Replace placeholder export toast with `handleDownloadQuote(quote)`.
  - Optional: page-level Export to Excel later (not required now).

## Storage & Fallback
- Use Supabase Storage bucket `quotes`; if upload fails, still perform `mailto:` without link and show a toast.

## Verification
- Build runs; send/download work on both pages.
- PDF contains logo (if present), correct totals and items.
- Status changes to `sent` after send; errors handled via toasts.

## Acceptance Criteria
- Per-quote Download and Send available in Sales Quotes and Dashboard Quotes pages.
- Download saves a PDF; Send opens mail client with (when possible) a public link.
- No runtime errors; styles consistent with invoices.