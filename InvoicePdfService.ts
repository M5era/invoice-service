/**
 * DomoPay - InvoicePdfService
 * Generates tax-compliant German invoices (§14 UStG) as A4 PDFs.
 * Design: Clean minimal style inspired by Stripe's hero-centric invoice layout.
 */

import PDFDocument from 'pdfkit';
import { ALLOWED_COUNTRIES } from '../config/countries';
import { IInvoiceVendorSnapshot, IInvoiceCustomer, IInvoiceItem } from '../models/Invoice';

export interface InvoiceDocumentInput {
    invoiceNumber: string;
    invoiceDate: Date;
    serviceDate?: Date;
    vendor: IInvoiceVendorSnapshot;
    customer: IInvoiceCustomer;
    items: IInvoiceItem[];
    totalNet: number;
    totalTax: number;
    totalGross: number;
    currency: string;
    paymentConfirmed?: boolean;
}

export interface ReceiptPaymentHistoryEntry {
    paymentMethod: string;
    paidDate: Date;
    amountPaid: number;
    receiptNumber: string;
}

export interface ReceiptDocumentInput extends InvoiceDocumentInput {
    receiptNumber: string;
    paidDate: Date;
    paymentHistory: ReceiptPaymentHistoryEntry[];
}

// ─── page geometry ────────────────────────────────────────────────────────────
const W = 595.28;          // A4 width  (pt)
const H = 841.89;          // A4 height (pt)
const ML = 56;              // margin left
const MR = 56;              // margin right
const CW = W - ML - MR;     // 483.28 pt content width

// ─── design tokens ────────────────────────────────────────────────────────────
const TEXT = '#1a1a1a';   // Slightly softer black
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';


// ─── helpers ─────────────────────────────────────────────────────────────────
function eur(cents: number, currency = 'EUR'): string {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: currency.toUpperCase(),
    }).format(cents / 100);
}

function fmtDate(d: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(d);
}

function displayCountry(country?: string): string {
    if (!country) return 'Deutschland';

    const normalizedCountry = country.trim();
    if (!/^[A-Za-z]{2}$/.test(normalizedCountry)) {
        return normalizedCountry;
    }

    const regionCode = normalizedCountry.toUpperCase();
    if (!ALLOWED_COUNTRIES.includes(regionCode)) {
        return regionCode;
    }

    return new Intl.DisplayNames(['de'], { type: 'region' }).of(regionCode) ?? regionCode;
}

function hline(doc: PDFKit.PDFDocument, y: number) {
    doc.moveTo(ML, y).lineTo(W - MR, y).strokeColor(BORDER).lineWidth(0.6).stroke();
}

interface DocumentConfig {
    title: string;
    metaRows: [string, string][];
    totalLabel: string;
    paymentHistory?: ReceiptPaymentHistoryEntry[];
    paymentStatus?: { paid: true; paidDate: Date } | { paid: false };
    paymentProcessorNotice?: string;
}

// ─── service ─────────────────────────────────────────────────────────────────
class InvoicePdfService {
    generateInvoice(inv: InvoiceDocumentInput): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                info: {
                    Title: `Rechnung ${inv.invoiceNumber}`,
                    Author: inv.vendor.companyName,
                },
            });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            this.renderDocument(doc, inv, {
                title: 'Rechnung',
                metaRows: [
                    ['Rechnungsnummer', inv.invoiceNumber],
                    ['Ausstellungsdatum', fmtDate(inv.invoiceDate)],
                    ['Leistungsdatum', fmtDate(inv.serviceDate ?? inv.invoiceDate)],
                ],
                totalLabel: inv.paymentConfirmed ? 'Bezahlter Betrag' : 'Offener Betrag',
                paymentProcessorNotice: 'Zahlungsabwicklung erfolgte durch domopay (domoforce GmbH).',
            });
            doc.end();
        });
    }

    generateReceipt(receipt: ReceiptDocumentInput): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                info: {
                    Title: `Beleg ${receipt.receiptNumber}`,
                    Author: receipt.vendor.companyName,
                },
            });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            this.renderDocument(doc, receipt, {
                title: 'Beleg',
                metaRows: [
                    ['Rechnungsnummer', receipt.invoiceNumber],
                    ['Belegnummer', receipt.receiptNumber],
                    ['Leistungsdatum', fmtDate(receipt.serviceDate ?? receipt.invoiceDate)],
                    ['Zahlungsdatum', fmtDate(receipt.paidDate)],
                ],
                totalLabel: 'Bezahlter Betrag',
                paymentHistory: receipt.paymentHistory,
                paymentStatus: { paid: true, paidDate: receipt.paidDate },
            });
            doc.end();
        });
    }

    generate(inv: InvoiceDocumentInput): Promise<Buffer> {
        return this.generateInvoice(inv);
    }

    private renderDocument(
        doc: PDFKit.PDFDocument,
        input: InvoiceDocumentInput,
        config: DocumentConfig
    ): void {
        let y = 60;
        const v = input.vendor;
        const c = input.customer;

        // ── 1. Company name — top right ───────────────────────────────────────
        if (v.companyName) {
            doc.fontSize(16).font('Helvetica-Bold').fillColor(TEXT)
                .text(v.companyName, ML, y, { width: CW, align: 'right' });
        }
        y += 36;

        // ── 2. Vendor return-address line ─────────────────────────────────────
        const addrParts = [
            v.companyName,
            v.street,
            `${v.postalCode || ''} ${v.city || ''}`.trim(),
            v.country ? displayCountry(v.country) : undefined,
        ].filter(Boolean);
        doc.fontSize(8).font('Helvetica').fillColor(MUTED)
            .text(addrParts.join(' · '), ML, y, { width: CW * 0.55 });
        y += 20;

        // ── 3. Customer block (left) + Meta box (right) ───────────────────────
        const colStartY = y;
        const LEFT_W  = Math.floor(CW * 0.52);
        const BOX_W   = Math.floor(CW * 0.44);
        const BOX_X   = W - MR - BOX_W;
        const BOX_PAD_X = 10;
        const BOX_PAD_Y = 10;
        const META_ROW_H = 15;
        const boxH = BOX_PAD_Y * 2 + config.metaRows.length * META_ROW_H;

        // Gray meta box background
        doc.roundedRect(BOX_X, colStartY, BOX_W, boxH, 5).fill('#f3f4f6');

        // Meta rows inside box
        const labelW = Math.floor(BOX_W * 0.52);
        const valueW = BOX_W - labelW - BOX_PAD_X * 2;
        let metaY = colStartY + BOX_PAD_Y;
        config.metaRows.forEach(([label, value]) => {
            doc.fontSize(8).font('Helvetica').fillColor(MUTED)
                .text(label, BOX_X + BOX_PAD_X, metaY, { width: labelW });
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(TEXT)
                .text(value, BOX_X + BOX_PAD_X + labelW, metaY, { width: valueW, align: 'right' });
            metaY += META_ROW_H;
        });

        // Customer address
        doc.fontSize(9).font('Helvetica').fillColor(TEXT);
        const custLines = [
            c.name,
            c.street,
            `${c.postalCode ?? ''} ${c.city ?? ''}`.trim() || undefined,
            c.country ? displayCountry(c.country) : undefined,
        ].filter(Boolean);
        let custY = colStartY + 6;
        custLines.forEach((line) => {
            doc.text(line!, ML, custY, { width: LEFT_W });
            custY += 13;
        });

        y = Math.max(custY, colStartY + boxH) + 48;

        // ── 4. Document title ─────────────────────────────────────────────────
        doc.fontSize(22).font('Helvetica-Bold').fillColor(TEXT)
            .text(config.title, ML, y, { width: CW });
        y += 45;

        // ── Items Table ───────────────────────────────────────────────────────
        y = this.renderItemsTable(doc, input, y, config.totalLabel);

        // ── Payment processor notice (always on Rechnung) ─────────────────────
        if (config.paymentProcessorNotice) {
            y += 24;
            doc.fontSize(9).font('Helvetica').fillColor(MUTED)
                .text(config.paymentProcessorNotice, ML, y, { width: CW });
            y += 14;
        }

        // ── Payment Status Block ──────────────────────────────────────────────
        if (config.paymentStatus) {
            y += 20;
            y = this.renderPaymentStatus(doc, config.paymentStatus, y);
        }

        if (config.paymentHistory && config.paymentHistory.length > 0) {
            y += 24;
            y = this.renderPaymentHistory(doc, input.currency, config.paymentHistory, y);
        }

        // ── Footer ────────────────────────────────────────────────────────────
        this.renderFooter(doc, v);
    }

    private renderItemsTable(
        doc: PDFKit.PDFDocument,
        input: InvoiceDocumentInput,
        startY: number,
        totalLabel: string
    ): number {
        let y = startY;
        const C_QTY = 40;
        const C_UNIT = 80;
        const C_TOTAL = 80;
        const C_DESC = CW - C_QTY - C_UNIT - C_TOTAL;

        // Column Headers
        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
        doc.text('Beschreibung', ML, y, { width: C_DESC });
        doc.text('Menge', ML + C_DESC, y, { width: C_QTY, align: 'right' });
        doc.text('Stückpreis', ML + C_DESC + C_QTY, y, { width: C_UNIT, align: 'right' });
        doc.text('Betrag', ML + CW - C_TOTAL, y, { width: C_TOTAL, align: 'right' });

        y += 16;
        hline(doc, y);
        y += 12;

        // Rows
        input.items.forEach(item => {
            const parts = item.description.split('\n');
            const itemName = parts[0] ?? item.description;
            const subDesc = parts.slice(1).join('\n');

            doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT);
            const nameH = doc.heightOfString(itemName, { width: C_DESC });
            doc.fontSize(8).font('Helvetica').fillColor(MUTED);
            const subH = subDesc ? doc.heightOfString(subDesc, { width: C_DESC }) + 2 : 0;
            const rowH = nameH + subH + 8;

            doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT)
                .text(itemName, ML, y, { width: C_DESC });
            if (subDesc) {
                doc.fontSize(8).font('Helvetica').fillColor(MUTED)
                    .text(subDesc, ML, y + nameH + 2, { width: C_DESC });
            }
            doc.fontSize(9).font('Helvetica').fillColor(TEXT);
            doc.text(String(item.quantity), ML + C_DESC, y, { width: C_QTY, align: 'right' });
            doc.text(eur(item.unitPriceNet, input.currency), ML + C_DESC + C_QTY, y, { width: C_UNIT, align: 'right' });
            doc.text(eur(item.totalGross, input.currency), ML + CW - C_TOTAL, y, { width: C_TOTAL, align: 'right' });
            y += rowH;
        });

        y += 10;
        hline(doc, y);
        y += 15;

        // ── Totals Section ──
        const TX = ML + CW - 160;
        const addTotalRow = (label: string, value: string, isBold: boolean) => {
            doc.fontSize(9).font(isBold ? 'Helvetica-Bold' : 'Helvetica').fillColor(TEXT);
            doc.text(label, TX, y, { width: 80, align: 'left' });
            doc.text(value, TX + 80, y, { width: 80, align: 'right' });
            y += 16;
        };

        addTotalRow('Zwischensumme', eur(input.totalNet, input.currency), false);
        const effectiveTaxRate = input.totalNet > 0
            ? Math.round((input.totalTax / input.totalNet) * 100)
            : 0;
        addTotalRow(`MwSt. ${effectiveTaxRate} %`, eur(input.totalTax, input.currency), false);
        addTotalRow('Gesamtbetrag', eur(input.totalGross, input.currency), false);
        y += 4;
        addTotalRow(totalLabel, eur(input.totalGross, input.currency), true);

        return y;
    }

    private renderPaymentStatus(
        doc: PDFKit.PDFDocument,
        status: NonNullable<DocumentConfig['paymentStatus']>,
        startY: number
    ): number {
        const isPaid = status.paid;
        const BG    = isPaid ? '#dcfce7' : '#fef9c3';
        const BORD  = isPaid ? '#86efac' : '#fcd34d';
        const CLR   = isPaid ? '#166534' : '#854d0e';

        const label   = isPaid ? 'Zahlungsstatus: Bezahlt' : 'Zahlungsstatus: Ausstehend';
        const subText = isPaid && status.paid
            ? `Zahlungseingang am ${fmtDate(status.paidDate)} · Zahlungsabwicklung durch domopay (domoforce GmbH)`
            : 'Zahlung noch nicht eingegangen · Zahlungsabwicklung durch domopay (domoforce GmbH)';

        const padX = 12;
        const padY = 10;
        const innerW = CW - padX * 2;

        doc.fontSize(9).font('Helvetica-Bold');
        const labelH = doc.heightOfString(label, { width: innerW });
        doc.font('Helvetica');
        const subH = doc.heightOfString(subText, { width: innerW });
        const boxH = padY * 2 + labelH + 4 + subH;

        doc.roundedRect(ML, startY, CW, boxH, 6)
            .fillAndStroke(BG, BORD);

        doc.fontSize(9).font('Helvetica-Bold').fillColor(CLR)
            .text(label, ML + padX, startY + padY, { width: innerW });
        doc.font('Helvetica').fillColor(CLR)
            .text(subText, ML + padX, startY + padY + labelH + 4, { width: innerW });

        return startY + boxH + 16;
    }

    private renderPaymentHistory(
        doc: PDFKit.PDFDocument,
        currency: string,
        paymentHistory: ReceiptPaymentHistoryEntry[],
        startY: number
    ): number {
        let y = startY;
        const col1 = 220;
        const col2 = 90;
        const col3 = 90;
        const col4 = CW - col1 - col2 - col3;

        doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT)
            .text('Zahlungshistorie', ML, y);
        y += 24;

        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
        doc.text('Zahlungsmethode', ML, y, { width: col1 });
        doc.text('Datum', ML + col1, y, { width: col2 });
        doc.text('Bezahlter Betrag', ML + col1 + col2, y, { width: col3, align: 'right' });
        doc.text('Belegnummer', ML + col1 + col2 + col3, y, { width: col4, align: 'right' });

        y += 16;
        hline(doc, y);
        y += 12;

        paymentHistory.forEach((entry) => {
            doc.fontSize(9).font('Helvetica').fillColor(TEXT);
            doc.text(entry.paymentMethod, ML, y, { width: col1 });
            doc.text(fmtDate(entry.paidDate), ML + col1, y, { width: col2 });
            doc.text(eur(entry.amountPaid, currency), ML + col1 + col2, y, { width: col3, align: 'right' });
            doc.text(entry.receiptNumber, ML + col1 + col2 + col3, y, { width: col4, align: 'right' });
            y += 20;
        });

        return y;
    }

    private renderFooter(doc: PDFKit.PDFDocument, v: IInvoiceVendorSnapshot): void {
        const fy = H - 60;
        hline(doc, fy);

        // Expanded multi-line footer 
        const line1 = [
            v.companyName || 'domoforce GmbH',
            v.street ? `${v.street}` : '',
            v.postalCode && v.city ? `${v.postalCode} ${v.city}` : '',
            v.country ? displayCountry(v.country) : '',
        ].filter(Boolean).join(' - ');

        const taxParts = [
            v.taxNumber ? `St.-Nr.: ${v.taxNumber}` : '',
            v.vatId ? `USt-IdNr.: ${v.vatId}` : '',
        ].filter(Boolean).join(' · ');
        const line2 = v.managingDirector ? `Vertreten durch ${v.managingDirector}` : '';
        const line3 = taxParts;

        doc.fontSize(8).font('Helvetica').fillColor(MUTED);
        let fy2 = fy + 12;
        doc.text(line1, ML, fy2, { width: CW, align: 'center' });
        if (line2) { fy2 += 12; doc.text(line2, ML, fy2, { width: CW, align: 'center' }); }
        if (line3) { fy2 += 12; doc.text(line3, ML, fy2, { width: CW, align: 'center' }); }
    }
}

export default new InvoicePdfService();
