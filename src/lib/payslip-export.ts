import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CompanyForPDF {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  logo_url?: string | null;
}

export interface PayslipDetails {
  hours?: number;
  overtime_hours?: number;
  overtime_amount?: number;
  bonuses?: number;
  commission?: number;
  allowances?: Array<{ name: string; amount: number }>;
  deductions?: Array<{ name: string; amount: number }>;
}

export interface PayslipForPDF {
  period_start: string;
  period_end: string;
  employee_name: string;
  id_number?: string | null;
  tax_number?: string | null;
  position?: string | null;
  gross: number;
  net: number;
  paye: number;
  uif_emp: number;
  uif_er: number;
  sdl_er: number;
  details?: PayslipDetails | null;
}

export const addLogoToPDF = (doc: jsPDF, logoUrl?: string | null) => {
  // If company logo is provided and valid, use it
  if (logoUrl) {
    try {
      doc.addImage(logoUrl, 'PNG', 150, 10, 40, 20, undefined, 'FAST');
      return;
    } catch (e) {
      console.warn('Failed to add company logo to PDF', e);
    }
  }
  
  // Fallback: Use Rigel logo if company logo missing or failed
  // Note: For client-side PDF generation, we need base64 or a publicly accessible URL.
  // Ideally, we should fetch the Rigel logo as base64 or have it embedded.
  // For now, let's assume we can't easily fetch the public URL inside this sync function without pre-loading.
  // But the calling function `downloadCurrentPayslip` handles fetching `logoDataUrl`.
  // So if we reach here, it means `logoUrl` (which is `logoDataUrl` from caller) is null.
  
  // We can try to add a text fallback or drawing if no image
  doc.setFontSize(10);
  doc.setTextColor(150);
  doc.text("Powered by Rigel Business", 150, 15);
  doc.setTextColor(0);
};

export const buildPayslipPDF = (
  slip: PayslipForPDF,
  company: CompanyForPDF
) => {
  const doc = new jsPDF();
  const fmt = (n?: number) => `R ${(n ?? 0).toFixed(2)}`;
  const payDate = new Date(slip.period_end).toLocaleDateString('en-ZA');
  
  // ================= COLORS =================
  const PRIMARY_COLOR = [0, 112, 173] as [number, number, number]; // Rigel Blue
  const SECONDARY_COLOR = [240, 240, 240] as [number, number, number]; // Light Grey
  const TEXT_DARK = [30, 30, 30] as [number, number, number];
  const TEXT_LIGHT = [100, 100, 100] as [number, number, number];

  // ================= HEADER =================
  // Blue banner at top
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, 210, 30, 'F');
  
  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text('PAYSLIP', 195, 20, { align: 'right' });
  
  // Logo (if exists)
  if (company.logo_url) {
      addLogoToPDF(doc, company.logo_url);
  } else {
      // Fallback text if no logo
      doc.setFontSize(16);
      doc.text("Rigel Business", 15, 20);
  }

  // ================= COMPANY & EMPLOYEE INFO =================
  let y = 45;
  
  // Company Details (Left)
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(company.name || 'Company Name', 15, y);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_LIGHT);
  y += 5;
  if (company.address) { doc.text(company.address, 15, y); y += 4; }
  if (company.phone) { doc.text(`Tel: ${company.phone}`, 15, y); y += 4; }
  if (company.email) { doc.text(`Email: ${company.email}`, 15, y); y += 4; }
  if (company.tax_number) { doc.text(`Tax No: ${company.tax_number}`, 15, y); y += 4; }

  // Employee Details (Right Box)
  // Draw box background
  doc.setFillColor(...SECONDARY_COLOR);
  doc.roundedRect(110, 35, 85, 40, 2, 2, 'F');
  
  let ey = 42;
  const ex = 115;
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(slip.employee_name, ex, ey);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_LIGHT);
  ey += 6;
  
  if (slip.position) { doc.text(`Position: ${slip.position}`, ex, ey); ey += 5; }
  if (slip.id_number) { doc.text(`ID No: ${slip.id_number}`, ex, ey); ey += 5; }
  if (slip.tax_number) { doc.text(`Tax No: ${slip.tax_number}`, ex, ey); ey += 5; }
  
  // Period Details
  ey += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(ex, ey, 190, ey); // separator line
  ey += 5;
  doc.text(`Period: ${new Date(slip.period_start).toLocaleDateString('en-ZA')} - ${payDate}`, ex, ey);
  ey += 5;
  doc.text(`Pay Date: ${payDate}`, ex, ey);

  // ================= EARNINGS & DEDUCTIONS TABLES =================
  const tableY = 85;
  
  // Prepare Data
  const det = slip.details || {} as any;
  const earningsList: Array<any[]> = [];
  const base = Math.max(0, (slip.gross || 0) - (det.overtime_amount || 0) - ((det.allowances || []).reduce((s: number, a: any) => s + (a.amount || 0), 0)));
  
  if (base > 0) earningsList.push(['Basic Salary', fmt(base)]);
  const allowTotal = (det.allowances || []).reduce((s: number, a: any) => s + (a.amount || 0), 0);
  if (allowTotal > 0) earningsList.push(['Allowances', fmt(allowTotal)]);
  if ((det.overtime_amount || 0) > 0) earningsList.push(['Overtime', fmt(det.overtime_amount || 0)]);
  if ((det.bonuses || 0) > 0) earningsList.push(['Bonus', fmt(det.bonuses || 0)]);
  
  // Fill empty rows to balance height
  while(earningsList.length < 4) earningsList.push(['', '']);

  const deductionsList: Array<any[]> = [];
  if ((slip.paye || 0) > 0) deductionsList.push(['PAYE (Tax)', fmt(slip.paye)]);
  if ((slip.uif_emp || 0) > 0) deductionsList.push(['UIF (Employee)', fmt(slip.uif_emp)]);
  const otherDeds = Array.isArray(det.deductions) ? det.deductions.filter((d: any) => !String(d.name || '').toLowerCase().includes('paye') && !String(d.name || '').toLowerCase().includes('uif')) : [];
  otherDeds.forEach((d: any) => deductionsList.push([String(d.name || 'Deduction'), fmt(Number(d.amount || 0))]));
  
  while(deductionsList.length < 4) deductionsList.push(['', '']);

  // Earnings Table (Left)
  autoTable(doc, {
    startY: tableY,
    head: [['EARNINGS', 'AMOUNT']],
    body: earningsList,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, lineColor: [230, 230, 230], lineWidth: { bottom: 0.1 } },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: 255, fontStyle: 'bold', halign: 'left' },
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 15 },
    tableWidth: 85
  });

  // Deductions Table (Right)
  autoTable(doc, {
    startY: tableY,
    head: [['DEDUCTIONS', 'AMOUNT']],
    body: deductionsList,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, lineColor: [230, 230, 230], lineWidth: { bottom: 0.1 } },
    headStyles: { fillColor: [200, 60, 60], textColor: 255, fontStyle: 'bold', halign: 'left' }, // Red for deductions
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 110 },
    tableWidth: 85
  });

  // ================= TOTALS SECTION =================
  let finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Draw Totals Box
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(15, finalY, 180, 35, 2, 2, 'FD');
  
  let ty = finalY + 10;
  
  // Column 1: Gross
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_LIGHT);
  doc.text("Total Gross Earnings", 25, ty);
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.setFont("helvetica", "bold");
  doc.text(fmt(slip.gross), 25, ty + 7);
  
  // Column 2: Total Deductions
  const totalDeds = (slip.paye || 0) + (slip.uif_emp || 0) + otherDeds.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_LIGHT);
  doc.text("Total Deductions", 85, ty);
  doc.setFontSize(11);
  doc.setTextColor([200, 60, 60]); // Red
  doc.setFont("helvetica", "bold");
  doc.text(fmt(totalDeds), 85, ty + 7);
  
  // Column 3: Net Pay (Highlight)
  doc.setFillColor(...PRIMARY_COLOR);
  doc.roundedRect(140, finalY + 5, 50, 25, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("NET PAY", 145, ty);
  doc.setFontSize(14);
  doc.text(fmt(slip.net), 145, ty + 8);

  // ================= FOOTER =================
  const pageHeight = doc.internal.pageSize.height;
  
  // Employer Contributions (Small text at bottom)
  const contribText = [];
  if ((slip.uif_er || 0) > 0) contribText.push(`Company UIF: ${fmt(slip.uif_er)}`);
  if ((slip.sdl_er || 0) > 0) contribText.push(`Company SDL: ${fmt(slip.sdl_er)}`);
  
  if (contribText.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_LIGHT);
      doc.text(contribText.join("  |  "), 15, pageHeight - 20);
  }

  // System Footer
  doc.setDrawColor(230, 230, 230);
  doc.line(15, pageHeight - 15, 195, pageHeight - 15);
  
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${new Date().toLocaleDateString()} by Rigel Business`, 15, pageHeight - 8);
  
  return doc;
};
