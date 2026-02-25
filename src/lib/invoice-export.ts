import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoiceForPDF {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  customer_name: string;
  customer_email?: string | null;
  notes?: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
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

export interface InvoiceItemForPDF {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export const buildInvoicePDF = (
  invoice: InvoiceForPDF,
  items: InvoiceItemForPDF[],
  company: CompanyForPDF
) => {
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString('en-ZA');

  // Colors
  const PRIMARY_COLOR: [number, number, number] = [30, 41, 59]; // Slate 800
  const ACCENT_COLOR: [number, number, number] = [59, 130, 246]; // Blue 500

  // Header Background
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, 210, 40, 'F');

  // Company Name (Top Left, White) - adjusted for logo
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(company.name || 'Company Name', 55, 25);

  // Invoice Label (Top Right, White)
  doc.setFontSize(30);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('TAX INVOICE', 196, 25, { align: 'right' });

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
  
  // Address handling to avoid overlay
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
  if (company.tax_number) {
    doc.text(`Tax ID: ${company.tax_number}`, leftColX, currentY);
    currentY += 5;
  }
  if (company.vat_number) {
    doc.text(`VAT No: ${company.vat_number}`, leftColX, currentY);
    currentY += 5;
  }

  // --- Invoice Details (Right) ---
  let metaY = 55;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Helper for meta rows
  const addMetaRow = (label: string, value: string) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, rightColX, metaY);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(value, 196, metaY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    metaY += 6;
  };

  addMetaRow("Invoice #:", invoice.invoice_number);
  addMetaRow("Date:", new Date(invoice.invoice_date).toLocaleDateString('en-ZA'));
  addMetaRow("Due Date:", invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-ZA') : 'Due on Receipt');
  
  // Spacing before "Bill To"
  metaY += 6;
  doc.setFont(undefined, 'bold');
  doc.text("BILL TO:", rightColX, metaY);
  metaY += 5;
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(invoice.customer_name, rightColX, metaY);
  metaY += 5;
  if (invoice.customer_email) {
    doc.text(invoice.customer_email, rightColX, metaY);
  }

  // Ensure items table starts below the lowest content
  const startTableY = Math.max(currentY, metaY) + 10;

  // --- Items Table ---
  const tableBody = items.map((it, idx) => {
    const price = it.quantity * it.unit_price;
    return [
      idx + 1,
      it.description || 'Item',
      it.quantity,
      `R ${it.unit_price.toFixed(2)}`,
      `${(it.tax_rate || 0).toFixed(0)}%`,
      `R ${price.toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: startTableY,
    head: [['#', 'Description', 'Qty', 'Price', 'Tax', 'Total']],
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
  
  // Draw Totals Box Background
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

  addTotalRow('Subtotal:', `R ${invoice.subtotal.toFixed(2)}`);
  addTotalRow('VAT (15%):', `R ${invoice.tax_amount.toFixed(2)}`);
  doc.setDrawColor(200, 200, 200);
  doc.line(135, finalY, 195, finalY); // Separator line
  finalY += 2;
  addTotalRow('Total:', `R ${invoice.total_amount.toFixed(2)}`, true, true);

  // --- Footer Section ---
  const pageHeight = doc.internal.pageSize.height;
  
  // Footer Background
  doc.setFillColor(245, 245, 245);
  doc.rect(0, pageHeight - 30, 210, 30, 'F');
  
  // Footer Content
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'normal');
  
  const footerText1 = `Thank you for your business!`;
  const footerText2 = `Please make checks payable to ${company.name}`;
  const footerText3 = `Generated by Rigel Business Accounting System`;
  
  doc.text(footerText1, 105, pageHeight - 20, { align: 'center' });
  doc.text(footerText2, 105, pageHeight - 15, { align: 'center' });
  
  // Branding (Small & Subtle)
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(footerText3, 105, pageHeight - 8, { align: 'center' });

  // Add Logo at the end to ensure it layers correctly if needed, though header background is at top
  // Note: Logo addition logic is handled by the caller using addLogoToPDF, but we reserved space in the header.

  return doc;
};

export const exportInvoiceToPDF = (
  invoice: InvoiceForPDF,
  items: InvoiceItemForPDF[],
  company: CompanyForPDF,
  filename = `tax_invoice_${invoice.invoice_number}`
) => {
  const doc = buildInvoicePDF(invoice, items, company);
  doc.save(`${filename}.pdf`);
};

export const addLogoToPDF = (doc: any, logoDataUrl: string) => {
  try {
    // Add logo in the header area, left aligned
    // White background circle for logo to pop against the dark header
    doc.setFillColor(255, 255, 255);
    doc.circle(26, 20, 14, 'F'); 
    
    // Add image centered in the circle
    doc.addImage(logoDataUrl, 'PNG', 16, 10, 20, 20);
  } catch (e) {
    console.warn('Failed to add logo to PDF', e);
  }
};

// Fetch a logo image as Data URL suitable for jsPDF.addImage
export const fetchLogoDataUrl = async (logoUrl?: string | null): Promise<string> => {
  if (!logoUrl) return '';
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read logo blob'));
      reader.onloadend = () => resolve((reader.result || '') as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Failed to fetch logo for PDF', e);
    return '';
  }
};
