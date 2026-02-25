
const fs = require('fs');
const path = require('path');

const sourcePath = path.join('src', 'components', 'FinancialReports', 'GAAPFinancialStatements.tsx');
const destPath = path.join('src', 'components', 'FinancialReports', 'BalanceSheetIIVComponent.tsx');

try {
  const content = fs.readFileSync(sourcePath, 'utf8');
  const newContent = content.replace(
    'export const GAAPFinancialStatements',
    'export const BalanceSheetIIVComponent'
  );
  
  fs.writeFileSync(destPath, newContent);
  console.log('Successfully created BalanceSheetIIVComponent.tsx');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
