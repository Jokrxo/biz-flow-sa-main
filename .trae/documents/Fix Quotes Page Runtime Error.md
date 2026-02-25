## Goal
Resolve the white screen on Quotes by fixing `ReferenceError: Textarea is not defined` in `QuotesPage`.

## Fix
- Add missing import: `import { Textarea } from '@/components/ui/textarea'` to `src/pages/Quotes.tsx`.
- Rebuild and verify that the Quotes page renders and the send dialog works.

## Acceptance Criteria
- No runtime error on Quotes.
- Quotes page loads; send dialog opens without errors.