import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sender, Customer, LineItem, InvoiceRecord } from './store';

export interface InvoiceInput {
  sender: Sender;
  customer: Customer;
  invoiceNumber: string;
  invoiceDate: Date;
  serviceMonth: number;
  serviceYear: number;
  serviceDescription: string;
  items: LineItem[];
}

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 20;
const MR = 20;
const CW = PAGE_W - ML - MR;

const DARK = '#1a1a1a';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

// ── Font loading ──────────────────────────────────────────────────────────────
const fontCache: Record<string, string> = {};

async function loadFont(path: string): Promise<string> {
  if (fontCache[path]) return fontCache[path];
  const res = await fetch(path);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  fontCache[path] = btoa(binary);
  return fontCache[path];
}

async function registerFonts(doc: jsPDF): Promise<void> {
  const base = import.meta.env.BASE_URL + 'fonts/Inter/static/';
  const [normal, semibold, italic, semiboldItalic] = await Promise.all([
    loadFont(base + 'Inter_18pt-Regular.ttf'),
    loadFont(base + 'Inter_18pt-SemiBold.ttf'),
    loadFont(base + 'Inter_18pt-Italic.ttf'),
    loadFont(base + 'Inter_18pt-SemiBoldItalic.ttf'),
  ]);
  doc.addFileToVFS('Inter-Regular.ttf', normal);
  doc.addFont('Inter-Regular.ttf', 'inter', 'normal');
  doc.addFileToVFS('Inter-SemiBold.ttf', semibold);
  doc.addFont('Inter-SemiBold.ttf', 'inter', 'bold');
  doc.addFileToVFS('Inter-Italic.ttf', italic);
  doc.addFont('Inter-Italic.ttf', 'inter', 'italic');
  doc.addFileToVFS('Inter-SemiBoldItalic.ttf', semiboldItalic);
  doc.addFont('Inter-SemiBoldItalic.ttf', 'inter', 'bolditalic');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function eur(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function lastDay(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function hline(doc: jsPDF, y: number, x1 = ML, x2 = ML + CW): void {
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

// ── PDF generation ────────────────────────────────────────────────────────────
export async function generatePDF(input: InvoiceInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  await registerFonts(doc);

  const month2 = String(input.serviceMonth).padStart(2, '0');
  const last = lastDay(input.serviceMonth, input.serviceYear);
  const periodStart = `01.${month2}.`;
  const periodEnd = `${last}.${month2}.${input.serviceYear}`;
  const periodFull = `${periodStart} - ${periodEnd}`;

  // ── 1. Header ────────────────────────────────────────────────────
  const LEFT_W = 80;
  const RIGHT_X = ML + LEFT_W + 10;

  doc.setFontSize(9);
  doc.setTextColor(DARK);

  const custLines = [
    input.customer.name,
    input.customer.vatId,
    input.customer.street,
    input.customer.postalCity,
    input.customer.country,
  ].filter(Boolean);

  let ly = 22;
  custLines.forEach(line => {
    doc.setFont('inter', 'normal');
    doc.text(line, ML, ly);
    ly += 5;
  });

  let ry = 22;
  const senderLines = [
    input.sender.name,
    input.sender.nif,
    input.sender.street,
    input.sender.postalCity,
    input.sender.country,
  ].filter(Boolean);

  senderLines.forEach(line => {
    doc.setFont('inter', 'normal');
    doc.text(line, RIGHT_X, ry);
    ry += 5;
  });

  ry += 4;
  doc.setFont('inter', 'bold');
  doc.text(`Rechnungsnummer: ${input.invoiceNumber}`, RIGHT_X, ry);
  ry += 5;
  doc.text(`Rechnungsdatum: ${fmtDate(input.invoiceDate)}`, RIGHT_X, ry);
  ry += 5;

  let y = Math.max(ly, ry) + 12;

  // ── 2. Title ─────────────────────────────────────────────────────
  doc.setFont('inter', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(DARK);
  const titleLines = doc.splitTextToSize('Rechnung', CW) as string[];
  doc.text(titleLines, ML, y);
  y += titleLines.length * 7 + 4;

  // ── 3. Letter body ───────────────────────────────────────────────
  doc.setFont('inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(DARK);

  doc.text('Sehr geehrte Damen und Herren,', ML, y);
  y += 7.5;

  const bodyText = `Vielen Dank für ihr Vertrauen. Für die erbrachte Leistung vom ${periodStart} bis ${periodEnd} stelle ich Ihnen hiermit in Rechnung:`;
  const bodyLines = doc.splitTextToSize(bodyText, CW) as string[];
  doc.text(bodyLines, ML, y, { lineHeightFactor: 1.8 });
  y += bodyLines.length * 7 + 6;

  // ── 4. Items table ───────────────────────────────────────────────
  let totalNet = 0;
  const tableBody = input.items.map((item, idx) => {
    const rowTotal = item.qty * item.unitPrice;
    totalNet += rowTotal;
    return [String(idx + 1), item.description.trim() || ' ', String(item.qty), eur(item.unitPrice), eur(rowTotal)];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: CW,
    head: [[
      { content: 'Pos', styles: { halign: 'center' } },
      { content: 'Artikel', styles: { halign: 'left' } },
      { content: 'Anzahl', styles: { halign: 'center' } },
      { content: 'Einzelpreis', styles: { halign: 'right' } },
      { content: 'Summe netto', styles: { halign: 'right' } },
    ]],
    body: tableBody,
    columnStyles: {
      0: { cellWidth: 10, font: 'inter', fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 'auto', font: 'inter', fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
    },
    styles: {
      font: 'inter',
      fontStyle: 'normal',
      fontSize: 9,
      textColor: DARK,
      cellPadding: { top: 3, bottom: 3, left: 0, right: 2 },
      lineWidth: 0,
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'inter',
      fontStyle: 'bold',
      fontSize: 9,
      textColor: MUTED,
      fillColor: false,
      lineWidth: { bottom: 0.3 },
      lineColor: BORDER,
      cellPadding: { top: 0, bottom: 3, left: 0, right: 2 },
    },
    alternateRowStyles: {
      fillColor: [247, 248, 249],
    },
    rowPageBreak: 'avoid',
  });

  y = (doc as any).lastAutoTable.finalY + 7.5;

  // ── 5. Totals ────────────────────────────────────────────────────
  const TX = ML + CW - 70;

  const addRow = (label: string, value: string, bold = false) => {
    doc.setFont('inter', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(DARK);
    doc.text(label, TX, y);
    doc.text(value, ML + CW, y, { align: 'right' });
    y += 5.5;
  };

  addRow('Summe netto', eur(totalNet));
  addRow('USt. 0%', eur(0));
  y += 3;
  hline(doc, y, TX, ML + CW);
  y += 5.5;
  addRow('Rechnungssumme', eur(totalNet), true);
  y += 3;

  // ── 6. Reverse charge note ───────────────────────────────────────
  doc.setFont('inter', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(
    'Reverse Charge: Die Steuerschuldnerschaft geht auf den Leistungsempfänger über.',
    ML + CW / 2,
    y,
    { align: 'center' },
  );
  y += 13;

  // ── 7. Payment request ───────────────────────────────────────────
  doc.setFont('inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(DARK);
  const payLines = doc.splitTextToSize(
    'Ich bitte sie den Betrag innerhalb von 14 Tagen an untenstehendes Konto zu überweisen.',
    CW,
  ) as string[];
  doc.text(payLines, ML, y);
  y += payLines.length * 6 + 18;

  // ── 8. Sign-off ──────────────────────────────────────────────────
  doc.text('Mit freundlichen Grüßen,', ML, y);
  y += 9;
  doc.text(input.sender.name || 'Marc Serafin', ML, y);

  // ── 9. Footer ────────────────────────────────────────────────────
  const fy = PAGE_H - 15;
  hline(doc, fy);

  doc.setFont('inter', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);

  const parts = [
    input.sender.name,
    input.sender.iban ? `IBAN: ${input.sender.iban}` : null,
    input.sender.swift ? `SWIFT: ${input.sender.swift}` : null,
  ].filter(Boolean);

  doc.text(parts.join('   |   '), ML + CW / 2, fy + 5, { align: 'center', maxWidth: CW });

  return doc;
}

export function downloadPDF(doc: jsPDF, invoiceNumber: string): void {
  doc.save(`Rechnung_${invoiceNumber}.pdf`);
}

export async function generatePDFFromRecord(record: InvoiceRecord): Promise<jsPDF> {
  const [yyyy, mm, dd] = record.invoiceDate.split('-').map(Number);
  return generatePDF({
    sender: {
      name: record.senderName,
      nif: record.senderNif,
      street: record.senderStreet,
      postalCity: record.senderPostalCity,
      country: record.senderCountry,
      iban: record.senderIban,
      swift: record.senderSwift,
    },
    customer: {
      code: record.customerCode,
      name: record.customerName,
      vatId: record.customerVatId,
      street: record.customerStreet,
      postalCity: record.customerPostalCity,
      country: record.customerCountry,
      lastInvoiceSeq: 0,
    },
    invoiceNumber: record.invoiceNumber,
    invoiceDate: new Date(yyyy, mm - 1, dd),
    serviceMonth: record.serviceMonth,
    serviceYear: record.serviceYear,
    serviceDescription: record.serviceDescription,
    items: record.items,
  });
}
