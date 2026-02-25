## Goal
Add per-quote actions to send (email) and download (PDF) in both the Sales Quotes component and the Quotes page.

## Files to Update
- `src/components/Sales/SalesQuotes.tsx` (list view under Sales → Quotes)
- `src/pages/Quotes.tsx` (dashboard Quotes page)
- New utility: `src/lib/quote-export.ts` (PDF generation for quotes)

## Implementation
- Create `quote-export.ts` using `jspdf` + `jspdf-autotable`:
  - Types: `QuoteForPDF`, `QuoteItemForPDF`, `CompanyForPDF` (mirror invoice types).
  - `buildQuotePDF(quote, items, company)` renders header (company name), quote meta (quote number, date, expiry, customer), items table (description, qty, unit price, tax %, line total), totals (subtotal, tax, total), and notes.
  - `addLogoToPDF(doc, logoDataUrl)` support.
- In `Sales/SalesQuotes.tsx` add helpers:
  - `fetchCompanyForPDF()` → `companies` select name/email/phone/address/tax/vat/logo.
  - `fetchQuoteItemsForPDF(quoteId)` → from `quote_items` select description, quantity, unit_price, tax_rate.
  - `mapQuoteForPDF(quote)` → map existing fields to PDF DTO.
- Per-quote actions in `Sales/SalesQuotes.tsx`:
  - `handleDownloadQuote(quote)` → build PDF, fetch logo, `doc.save('quote_<number>.pdf')`.
  - Send dialog state: `sendDialogOpen`, `sendEmail`, `sendMessage`, `selectedQuote`.
  - `openSendDialog(quote)` → prefill recipient and message.
  - `handleSendEmail()`:
    - Build PDF → `doc.output('blob')`.
    - Upload to Supabase Storage bucket `quotes` at `quotes/quote_<number>.pdf` (`upsert: true`).
    - Get public URL; open `mailto:` with subject “Quote <number>” and body including link.
    - Update quote status (`status: 'sent'`) and optionally `sent_at` if column exists.
- Wire UI buttons (SalesQuotes):
  - In Actions cell add `Download` and `Mail` buttons beside Convert/Delete.
- Update `src/pages/Quotes.tsx`:
  - Add the same helpers (or share via small hooks) to download and send.
  - Replace placeholder `toast("PDF export coming soon")` with `handleDownloadQuote(quote)`.
  - Add `Mail` button next to Download per row; open a simple send dialog and reuse send logic.

## Styling & UX
- Consistent icons: `Download` and `Mail` from `lucide-react`.
- Dialog texts: “Send quote” and message prefilled “Please find your quote … Total: R …”.
- Success toasts and error handling consistent with invoices.

## Acceptance Criteria
- Both Sales Quotes and Quotes page show per-quote Download and Send actions.
- Download saves a proper PDF with company logo and totals.
- Send opens mail client with a public link to the uploaded quote PDF.
- Quote status updates to `sent` upon sending; no runtime errors; build succeeds.