import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TrialBalance } from '@/types/trial-balance';

export const exportToExcel = (data: TrialBalance[], filename = 'trial_balance') => {
  const exportData = data.map(entry => ({
    'Account Code': entry.account_code,
    'Account Name': entry.account_name,
    'Debit': entry.debit,
    'Credit': entry.credit,
  }));

  const totalDebits = data.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredits = data.reduce((sum, entry) => sum + entry.credit, 0);
  
  exportData.push({ 'Account Code': '', 'Account Name': 'TOTALS', 'Debit': totalDebits, 'Credit': totalCredits });

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Trial Balance');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToPDF = (data: TrialBalance[], filename = 'trial_balance') => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Trial Balance', 14, 22);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

  const tableData = data.map(entry => [entry.account_code, entry.account_name, entry.debit.toFixed(2), entry.credit.toFixed(2)]);
  const totalDebits = data.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredits = data.reduce((sum, entry) => sum + entry.credit, 0);
  tableData.push(['', 'TOTALS', totalDebits.toFixed(2), totalCredits.toFixed(2)]);

  autoTable(doc, {
    head: [['Account Code', 'Account Name', 'Debit', 'Credit']],
    body: tableData,
    startY: 40,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 112, 173], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (data) => { if (data.row.index === tableData.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [255, 215, 0]; } },
  });
  doc.save(`${filename}.pdf`);
};

// Transactions export
export interface ExportableTransaction { date: string; description: string; type: string; amount: number; vatAmount?: number; reference?: string }

export const exportTransactionsToExcel = (rows: ExportableTransaction[], filename = 'transactions') => {
  const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
    Date: r.date,
    Description: r.description,
    Type: r.type,
    Amount: r.amount,
    VAT: r.vatAmount ?? r.amount * 0.15,
    Reference: r.reference ?? ''
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportTransactionsToPDF = (rows: ExportableTransaction[], filename = 'transactions') => {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Transactions', 14, 18);
  const body = rows.map(r => [r.date, r.description, r.type, r.amount.toFixed(2), ((r.vatAmount ?? r.amount * 0.15)).toFixed(2), r.reference ?? '']);
  autoTable(doc, { head: [['Date','Description','Type','Amount','VAT','Reference']], body, startY: 26 });
  doc.save(`${filename}.pdf`);
};

// Financial Reports Export
export interface FinancialReportLine {
  account: string;
  amount: number;
  type?: string;
}

export const exportFinancialReportToExcel = (
  data: FinancialReportLine[], 
  reportName: string,
  filename: string
) => {
  const exportData = data.map(line => ({
    'Account': line.account,
    'Amount': (line.type === 'header' || line.type === 'main-header' || line.type === 'sub-header') ? '' : line.amount
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, reportName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportFinancialReportToPDF = (
  data: FinancialReportLine[],
  reportName: string,
  period: string,
  filename: string
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text(reportName, 14, 22);
  doc.setFontSize(10);
  doc.text(`Period: ${period}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 36);

  const tableData = data.map(line => [
    line.account,
    (line.type === 'header' || line.type === 'main-header' || line.type === 'sub-header') 
      ? '' 
      : `R ${line.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
  ]);

  autoTable(doc, {
    head: [['Account', 'Amount (ZAR)']],
    body: tableData,
    startY: 45,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 112, 173], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (cellData) => {
      const rowIndex = cellData.row.index;
      const line = data[rowIndex];
      if (line?.type === 'subtotal' || line?.type === 'total' || line?.type === 'final' || 
          line?.type === 'sub-total' || line?.type === 'main-total' || 
          line?.type === 'main-header' || line?.type === 'sub-header' || line?.type === 'header') {
        cellData.cell.styles.fontStyle = 'bold';
        if (line?.type !== 'main-header' && line?.type !== 'sub-header' && line?.type !== 'header') {
             cellData.cell.styles.fillColor = [240, 240, 240];
        } else {
             cellData.cell.styles.textColor = [0, 112, 173]; // Sage Blue #0070ad
        }
      }
    }
  });

  doc.save(`${filename}.pdf`);
};

// Invoices export
export interface ExportableInvoiceRow {
  invoice_number: string;
  customer_name: string;
  invoice_date: string | Date;
  due_date?: string | Date | null;
  status: string;
  total_amount: number;
  amount_paid?: number;
}

export const exportInvoicesToExcel = (
  rows: ExportableInvoiceRow[],
  filename = 'invoices'
) => {
  const data = rows.map((inv) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.amount_paid || 0);
    const outstanding = Math.max(0, total - paid);
    const invDate = typeof inv.invoice_date === 'string' ? new Date(inv.invoice_date) : inv.invoice_date;
    const dueDateRaw = inv.due_date ?? null;
    const dueDate = dueDateRaw ? (typeof dueDateRaw === 'string' ? new Date(dueDateRaw) : dueDateRaw) : null;
    return {
      'Invoice #': inv.invoice_number,
      'Customer': inv.customer_name,
      'Date': invDate.toLocaleDateString('en-ZA'),
      'Due Date': dueDate ? dueDate.toLocaleDateString('en-ZA') : '-',
      'Status': inv.status,
      'Total': total,
      'Paid': paid,
      'Outstanding': outstanding,
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportInvoicesToPDF = (
  rows: ExportableInvoiceRow[],
  periodLabel: string,
  filename = 'invoices'
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Customer Statement', 14, 22);
  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-ZA')}`, 14, 36);

  const body = rows.map((inv) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.amount_paid || 0);
    const outstanding = Math.max(0, total - paid);
    const invDate = typeof inv.invoice_date === 'string' ? new Date(inv.invoice_date) : inv.invoice_date;
    const dueDateRaw = inv.due_date ?? null;
    const dueDate = dueDateRaw ? (typeof dueDateRaw === 'string' ? new Date(dueDateRaw) : dueDateRaw) : null;
    return [
      inv.invoice_number,
      inv.customer_name,
      invDate.toLocaleDateString('en-ZA'),
      dueDate ? dueDate.toLocaleDateString('en-ZA') : '-',
      inv.status,
      `R ${total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
      `R ${outstanding.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    ];
  });

  autoTable(doc, {
    head: [['Invoice #','Customer','Date','Due Date','Status','Total','Outstanding']],
    body,
    startY: 45,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  doc.save(`${filename}.pdf`);
};

export interface StatementEntry { date: string; description: string; reference?: string | null; dr: number; cr: number }

export const exportCustomerStatementToPDF = (
  entries: StatementEntry[],
  customerName: string,
  periodLabel: string,
  openingBalance: number,
  filename = 'statement',
  customerInfo?: { email?: string; phone?: string; address?: string }
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Customer Statement', 14, 22);
  doc.setFontSize(10);
  doc.text(`Customer: ${customerName}`, 14, 30);
  doc.text(`Period: ${periodLabel}`, 14, 36);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-ZA')}`, 14, 42);
  if (customerInfo?.email) doc.text(`Email: ${customerInfo.email}`, 14, 48);
  if (customerInfo?.phone) doc.text(`Phone: ${customerInfo.phone}`, 14, 54);
  if (customerInfo?.address) doc.text(`Address: ${customerInfo.address}`, 14, 60);

  let running = Number(openingBalance || 0);
  const body = [
    ['', 'Opening Balance', '', '', '', `R ${running.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`],
    ...entries.map(e => {
      const dr = Number(e.dr || 0);
      const cr = Number(e.cr || 0);
      running = running + dr - cr;
      return [
        typeof e.date === 'string' ? new Date(e.date).toLocaleDateString('en-ZA') : new Date(e.date).toLocaleDateString('en-ZA'),
        e.description,
        e.reference ?? '',
        dr ? `R ${dr.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '',
        cr ? `R ${cr.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '',
        `R ${running.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
      ];
    })
  ];

  autoTable(doc, {
    head: [['Date','Description','Reference','DR','CR','Balance']],
    body,
    startY: customerInfo?.address || customerInfo?.phone || customerInfo?.email ? 66 : 50,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  doc.save(`${filename}.pdf`);
};

export interface ComparativeCashFlowRow { label: string; yearA: number; yearB: number; percent?: number; bold?: boolean }

export const exportComparativeCashFlowToExcel = (
  rows: ComparativeCashFlowRow[],
  yearA: number,
  yearB: number,
  filename = `Comparative_Cash_Flow_${yearA}_vs_${yearB}`
) => {
  const header = [{ Item: 'Item', [String(yearA)]: String(yearA), [String(yearB)]: String(yearB), '% Change': '% Change' }];
  const data = rows.map(r => ({
    Item: r.label,
    [String(yearA)]: r.yearA,
    [String(yearB)]: r.yearB,
    '% Change': typeof r.percent === 'number' ? `${r.percent.toFixed(1)}%` : ''
  }));
  const ws = XLSX.utils.json_to_sheet([...header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Cash Flow ${yearA} vs ${yearB}`);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportComparativeCashFlowToPDF = (
  rows: ComparativeCashFlowRow[],
  yearA: number,
  yearB: number,
  filename = `Comparative_Cash_Flow_${yearA}_vs_${yearB}`
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Comparative Cash Flow', 14, 22);
  doc.setFontSize(10);
  doc.text(`Years: ${yearA} vs ${yearB}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-ZA')}`, 14, 36);
  const body = rows.map(r => [
    r.label,
    `R ${Number(r.yearA || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    `R ${Number(r.yearB || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    typeof r.percent === 'number' ? `${r.percent.toFixed(1)}%` : ''
  ]);
  autoTable(doc, {
    head: [['Item', String(yearA), String(yearB), '% Change']],
    body,
    startY: 45,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (dataCell) => {
      const r = rows[dataCell.row.index];
      if (r?.bold) {
        dataCell.cell.styles.fontStyle = 'bold';
        dataCell.cell.styles.fillColor = [240, 240, 240];
      }
    }
  });
  doc.save(`${filename}.pdf`);
};

export const exportComparativeBalanceSheetToExcel = (
  rows: ComparativeCashFlowRow[],
  yearA: number,
  yearB: number,
  filename = `Comparative_Balance_Sheet_${yearA}_vs_${yearB}`
) => {
  const header = [{ Item: 'Item', [String(yearA)]: String(yearA), [String(yearB)]: String(yearB), '% Change': '% Change' }];
  const data = rows.map(r => ({
    Item: r.label,
    [String(yearA)]: r.yearA,
    [String(yearB)]: r.yearB,
    '% Change': typeof r.percent === 'number' ? `${r.percent.toFixed(1)}%` : ''
  }));
  const ws = XLSX.utils.json_to_sheet([...header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Balance Sheet ${yearA} vs ${yearB}`);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportComparativeBalanceSheetToPDF = (
  rows: ComparativeCashFlowRow[],
  yearA: number,
  yearB: number,
  filename = `Comparative_Balance_Sheet_${yearA}_vs_${yearB}`
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Comparative Balance Sheet', 14, 22);
  doc.setFontSize(10);
  doc.text(`Years: ${yearA} vs ${yearB}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-ZA')}`, 14, 36);
  const body = rows.map(r => [
    r.label,
    `R ${Number(r.yearA || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    `R ${Number(r.yearB || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`,
    typeof r.percent === 'number' ? `${r.percent.toFixed(1)}%` : ''
  ]);
  autoTable(doc, {
    head: [['Item', String(yearA), String(yearB), '% Change']],
    body,
    startY: 45,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    didParseCell: (dataCell) => {
      const r = rows[dataCell.row.index];
      if (r?.bold) {
        dataCell.cell.styles.fontStyle = 'bold';
        dataCell.cell.styles.fillColor = [240, 240, 240];
      }
    }
  });
  doc.save(`${filename}.pdf`);
};

export interface FinancialRatioItem {
  category: string;
  metric: string;
  value: string;
  status?: string;
}

export const exportFinancialRatiosToPDF = (
  items: FinancialRatioItem[],
  periodLabel: string,
  filename = 'financial_ratios'
) => {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Financial Ratios Report', 14, 22);
  doc.setFontSize(10);
  doc.text(`Period: ${periodLabel}`, 14, 30);
  doc.text(`Generated on: ${new Date().toLocaleDateString('en-ZA')}`, 14, 36);

  const tableData = items.map(item => [
    item.category,
    item.metric,
    item.value,
    item.status || '-'
  ]);

  autoTable(doc, {
    head: [['Category', 'Metric', 'Value', 'Status']],
    body: tableData,
    startY: 45,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 112, 173], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', halign: 'right' },
      3: { halign: 'center' }
    },
    didParseCell: (data) => {
      // Grouping logic visual enhancement could go here, but flat list is fine for now
      const rowIndex = data.row.index;
      if (rowIndex > 0 && items[rowIndex].category === items[rowIndex-1].category && data.column.index === 0) {
        data.cell.text = ['']; // Hide repeated category
      }
    }
  });

  doc.save(`${filename}.pdf`);
};
