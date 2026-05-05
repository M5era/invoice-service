export interface Sender {
  name: string;
  nif: string;
  street: string;
  postalCity: string;
  country: string;
  iban: string;
  swift: string;
}

export interface Customer {
  code: string;
  name: string;
  vatId: string;
  street: string;
  postalCity: string;
  country: string;
  lastInvoiceSeq: number;
}

export interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface LastUsed {
  customerCode: string;
  serviceMonth: number;
  serviceYear: number;
  serviceDescription: string;
  invoiceDate: string;
  items: LineItem[];
}

/** Full snapshot of a generated invoice — enough to reproduce the PDF exactly. */
export interface InvoiceRecord {
  invoiceNumber: string;
  invoiceDate: string;          // ISO date string "YYYY-MM-DD"
  generatedAt: string;          // ISO timestamp
  customerCode: string;
  customerName: string;
  customerVatId: string;
  customerStreet: string;
  customerPostalCity: string;
  customerCountry: string;
  senderName: string;
  senderNif: string;
  senderStreet: string;
  senderPostalCity: string;
  senderCountry: string;
  senderIban: string;
  senderSwift: string;
  serviceMonth: number;
  serviceYear: number;
  serviceDescription: string;
  items: LineItem[];
  total: number;
}

export interface AppData {
  sender: Sender;
  customers: Customer[];
  lastUsed: LastUsed;
  history: InvoiceRecord[];
  emailSubject: string;
  emailTemplate: string;
}

const KEY = 'invoice_data';

const now = new Date();

const DEFAULT_EMAIL = `Hi [Name],

Ich hoffe dir geht es gut.

Anbei findest du die Rechnung für den letzten Monat. Bei Fragen kannst du dich selbstverständlich jederzeit an mich melden.

Beste Grüße,
`;

const defaults: AppData = {
  sender: { name: '', nif: '', street: '', postalCity: '', country: 'Portugal', iban: '', swift: '' },
  customers: [],
  lastUsed: {
    customerCode: '',
    serviceMonth: now.getMonth() === 0 ? 12 : now.getMonth(),
    serviceYear: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    serviceDescription: '',
    invoiceDate: now.toISOString().slice(0, 10),
    items: [{ description: '', qty: 1, unitPrice: 0 }],
  },
  history: [],
  emailSubject: '',
  emailTemplate: DEFAULT_EMAIL,
};

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const saved = JSON.parse(raw) as Partial<AppData>;
    return {
      sender: { ...defaults.sender, ...saved.sender },
      customers: saved.customers ?? [],
      lastUsed: { ...defaults.lastUsed, ...saved.lastUsed },
      history: saved.history ?? [],
      emailSubject: saved.emailSubject ?? defaults.emailSubject,
      emailTemplate: saved.emailTemplate ?? defaults.emailTemplate,
    };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function nextInvoiceNumber(
  customers: Customer[],
  customerCode: string,
  year: number,
): { display: string; newSeq: number } {
  const customer = customers.find(c => c.code === customerCode);
  const seq = (customer?.lastInvoiceSeq ?? 0) + 1;
  return {
    display: `${year}-${customerCode}-${String(seq).padStart(3, '0')}`,
    newSeq: seq,
  };
}
