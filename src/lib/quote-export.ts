import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface QuoteForPDF {
  quote_number: string;
  quote_date: string;
  expiry_date: string | null;
  customer_name: string;
  customer_email: string | null;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

export interface QuoteItemForPDF {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

export interface CompanyForPDF {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_number?: string | null;
  vat_number?: string | null;
  logo_url?: string | null;
}

export const buildQuotePDF = (
  quote: QuoteForPDF,
  items: QuoteItemForPDF[],
  company: CompanyForPDF,
  title: string = 'QUOTE'
) => {
  const doc = new jsPDF();
  
  // Colors - Purple/Indigo Theme for Quotes
  const PRIMARY_COLOR: [number, number, number] = [67, 56, 202]; // Indigo 700
  
  // Header Background
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, 210, 40, 'F');

  // Company Name (Top Left, White) - adjusted for logo
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(company.name || 'Company Name', 55, 25);

  // Quote Label (Top Right, White)
  doc.setFontSize(30);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(title, 196, 25, { align: 'right' });

  doc.setTextColor(0, 0, 0); // Reset text color

  // Layout Constants
  const leftColX = 14;
  const rightColX = 140;
  let currentY = 55;

  // --- Company Details (Left) ---
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text("FROM:", leftColX, currentY);
  currentY += 5;
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  
  // Address handling
  if (company.address) {
    const addressLines = doc.splitTextToSize(company.address, 80);
    doc.text(addressLines, leftColX, currentY);
    currentY += (addressLines.length * 5);
  } else {
    currentY += 5;
  }
  
  if (company.phone) {
    doc.text(`Phone: ${company.phone}`, leftColX, currentY);
    currentY += 5;
  }
  if (company.email) {
    doc.text(`Email: ${company.email}`, leftColX, currentY);
    currentY += 5;
  }

  // --- Quote Details (Right) ---
  let metaY = 55;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  const addMetaRow = (label: string, value: string) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, rightColX, metaY);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(value, 196, metaY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    metaY += 6;
  };

  addMetaRow("Quote #:", quote.quote_number);
  addMetaRow("Date:", new Date(quote.quote_date).toLocaleDateString('en-ZA'));
  addMetaRow("Expiry:", quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('en-ZA') : 'N/A');
  
  // Bill To Section
  metaY += 6;
  doc.setFont(undefined, 'bold');
  doc.text("TO:", rightColX, metaY);
  metaY += 5;
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(quote.customer_name, rightColX, metaY);
  metaY += 5;
  if (quote.customer_email) {
    doc.text(quote.customer_email, rightColX, metaY);
  }

  // Ensure table starts below all content
  const startTableY = Math.max(currentY, metaY) + 10;

  const tableBody = items.map((it, idx) => [
    idx + 1,
    it.description,
    it.quantity,
    `R ${it.unit_price.toFixed(2)}`,
    `${it.tax_rate}%`,
    `R ${(it.quantity * it.unit_price).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: startTableY,
    head: [["#", "Description", "Qty", "Price", "Tax", "Total"]],
    body: tableBody,
    styles: { 
      fontSize: 9, 
      cellPadding: 4,
      textColor: [50, 50, 50]
    },
    headStyles: { 
      fillColor: PRIMARY_COLOR, 
      textColor: 255, 
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: { 
      0: { halign: 'center', cellWidth: 15 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 35 }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  });

  // --- Totals Section ---
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setFillColor(248, 250, 252);
  doc.rect(130, finalY - 2, 70, 40, 'F');
  
  const addTotalRow = (label: string, value: string, isBold = false, isBig = false) => {
    doc.setFont(undefined, isBold ? 'bold' : 'normal');
    doc.setFontSize(isBig ? 12 : 10);
    doc.setTextColor(0, 0, 0);
    doc.text(label, 135, finalY + 5);
    doc.text(value, 195, finalY + 5, { align: 'right' });
    finalY += (isBig ? 10 : 7);
  };

  addTotalRow('Subtotal:', `R ${quote.subtotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
  addTotalRow('Tax:', `R ${quote.tax_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`);
  doc.setDrawColor(200, 200, 200);
  doc.line(135, finalY, 195, finalY);
  finalY += 2;
  addTotalRow('Total:', `R ${quote.total_amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, true, true);

  // --- Footer Section ---
  const pageHeight = doc.internal.pageSize.height;
  
  // Footer Background
  doc.setFillColor(245, 245, 245);
  doc.rect(0, pageHeight - 30, 210, 30, 'F');
  
  // Footer Content
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'normal');
  
  const footerText1 = `This quote is valid until ${quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('en-ZA') : 'further notice'}`;
  const footerText2 = `Generated by Rigel Business Accounting System`;
  
  doc.text(footerText1, 105, pageHeight - 20, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(footerText2, 105, pageHeight - 10, { align: 'center' });

  return doc;
};

export const exportQuoteToPDF = (
  quote: QuoteForPDF,
  items: QuoteItemForPDF[],
  company: CompanyForPDF,
  filename?: string
) => {
  const doc = buildQuotePDF(quote, items, company);
  doc.save(`${filename || `quote_${quote.quote_number}`}.pdf`);
};
