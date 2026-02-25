const fs = require('fs');
const path = require('path');
const src = path.resolve('src/components/FinancialReports/GAAPFinancialStatements.tsx');
const dst = path.resolve('src/components/FinancialReports/BalanceSheetIIVComponent.tsx');
try {
  const content = fs.readFileSync(src, 'utf8');
  const newContent = content.replace('export function GAAPFinancialStatements', 'export function BalanceSheetIIVComponent');
  fs.writeFileSync(dst, newContent);
  console.log('Success');
} catch (e) {
  console.error(e);
}
