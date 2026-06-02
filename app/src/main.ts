import {
  loadData, saveData, nextInvoiceNumber,
  type AppData, type LineItem, type InvoiceRecord,
} from './store';
import { generatePDF, generatePDFFromRecord, downloadPDF, type InvoiceInput } from './pdf';
import {
  loadSyncConfig, saveSyncConfig, fetchGist, pushGist, createGist,
  type SyncConfig,
} from './gist';

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

let data = loadData();
let syncConfig = loadSyncConfig();
let isDirty = false;

function markDirty() {
  if (isDirty) return;
  isDirty = true;
  globalSaveBtn.disabled = false;
  globalSaveBtn.style.background = '#1a1a1a';
  globalSaveBtn.style.color = '#fff';
  globalSaveBtn.style.cursor = 'pointer';
}

function markClean() {
  isDirty = false;
  globalSaveBtn.disabled = true;
  globalSaveBtn.style.background = '#e5e7eb';
  globalSaveBtn.style.color = '#9ca3af';
  globalSaveBtn.style.cursor = 'not-allowed';
}

// ── DOM refs ───────────────────────────────────────────────────────────────────
const senderToggle = document.getElementById('sender-toggle')!;
const senderBody = document.getElementById('sender-body')!;

const sName = document.getElementById('s-name') as HTMLInputElement;
const sNif = document.getElementById('s-nif') as HTMLInputElement;
const sStreet = document.getElementById('s-street') as HTMLInputElement;
const sPostalCity = document.getElementById('s-postalcity') as HTMLInputElement;
const sCountry = document.getElementById('s-country') as HTMLInputElement;
const sIban = document.getElementById('s-iban') as HTMLInputElement;
const sSwift = document.getElementById('s-swift') as HTMLInputElement;
const globalSaveBtn = document.getElementById('global-save-btn') as HTMLButtonElement;

const customerSelect = document.getElementById('customer-select') as HTMLSelectElement;
const addCustomerBtn = document.getElementById('add-customer-btn')!;
const serviceMonth = document.getElementById('service-month') as HTMLSelectElement;
const serviceYear = document.getElementById('service-year') as HTMLInputElement;
const invoiceDate = document.getElementById('invoice-date') as HTMLInputElement;
const serviceDesc = document.getElementById('service-desc') as HTMLInputElement;
const invoiceNumber = document.getElementById('invoice-number') as HTMLInputElement;

const addItemBtn = document.getElementById('add-item-btn')!;
const itemsBody = document.getElementById('items-body')!;
const tNet = document.getElementById('t-net')!;
const tGross = document.getElementById('t-gross')!;

const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const newInvoiceBtn = document.getElementById('new-invoice-btn')!;

const emailSubjectEl = document.getElementById('email-subject') as HTMLInputElement;
const emailTemplateEl = document.getElementById('email-template') as HTMLTextAreaElement;
const copyEmailBtn = document.getElementById('copy-email-btn')!;
const mailOpenBtn = document.getElementById('mail-open-btn')!;

const syncToggle = document.getElementById('sync-toggle')!;
const syncBody = document.getElementById('sync-body')!;
const historyToggle = document.getElementById('history-toggle')!;
const historyBody = document.getElementById('history-body')!;
const historyBodyRows = document.getElementById('history-body-rows')!;
const historyEmpty = document.getElementById('history-empty')!;

const syncPatInput = document.getElementById('sync-pat') as HTMLInputElement;
const syncGistIdInput = document.getElementById('sync-gist-id') as HTMLInputElement;
const syncSaveBtn = document.getElementById('sync-save-btn')!;
const syncPullBtn = document.getElementById('sync-pull-btn')!;
const syncPushBtn = document.getElementById('sync-push-btn')!;
const syncStatus = document.getElementById('sync-status')!;
const exportBtn = document.getElementById('export-btn')!;
const importInput = document.getElementById('import-input') as HTMLInputElement;

const customerModal = document.getElementById('customer-modal')!;
const cancelCustomerBtn = document.getElementById('cancel-customer-btn')!;
const saveCustomerBtn = document.getElementById('save-customer-btn')!;
const cCode = document.getElementById('c-code') as HTMLInputElement;
const cName = document.getElementById('c-name') as HTMLInputElement;
const cVatId = document.getElementById('c-vatid') as HTMLInputElement;
const cStreet = document.getElementById('c-street') as HTMLInputElement;
const cPostalCity = document.getElementById('c-postalcity') as HTMLInputElement;
const cCountry = document.getElementById('c-country') as HTMLInputElement;

// ── Init ───────────────────────────────────────────────────────────────────────
function init() {
  sName.value = data.sender.name;
  sNif.value = data.sender.nif;
  sStreet.value = data.sender.street;
  sPostalCity.value = data.sender.postalCity;
  sCountry.value = data.sender.country;
  sIban.value = data.sender.iban;
  sSwift.value = data.sender.swift;

  refreshCustomerDropdown();

  serviceMonth.value = String(data.lastUsed.serviceMonth);
  serviceYear.value = String(data.lastUsed.serviceYear);
  invoiceDate.value = data.lastUsed.invoiceDate;
  serviceDesc.value = data.lastUsed.serviceDescription;

  refreshInvoiceNumber();
  renderItems(data.lastUsed.items);
  renderHistory();
  emailSubjectEl.value = data.emailSubject || '';
  if (!data.emailSubject) refreshEmailSubject();
  emailTemplateEl.value = data.emailTemplate;
}

// ── Customer dropdown ──────────────────────────────────────────────────────────
function refreshCustomerDropdown() {
  customerSelect.innerHTML = '';
  if (data.customers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Noch kein Kunde —';
    customerSelect.appendChild(opt);
  } else {
    data.customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = `${c.code} — ${c.name}`;
      customerSelect.appendChild(opt);
    });
    const saved = data.lastUsed.customerCode;
    if (saved && data.customers.some(c => c.code === saved)) {
      customerSelect.value = saved;
    }
  }
}

// ── Invoice number ─────────────────────────────────────────────────────────────
function refreshInvoiceNumber() {
  const code = customerSelect.value;
  const year = parseInt(invoiceDate.value.slice(0, 4) || String(new Date().getFullYear()), 10);
  if (!code) { invoiceNumber.value = ''; return; }
  const { display } = nextInvoiceNumber(data.customers, code, year);
  invoiceNumber.value = display;
}

// ── Email subject ──────────────────────────────────────────────────────────────
function refreshEmailSubject() {
  const num = invoiceNumber.value.trim();
  emailSubjectEl.value = num ? `Rechnung ${num}` : 'Rechnung';
}

// ── Line items ─────────────────────────────────────────────────────────────────
function renderItems(items: LineItem[]) {
  itemsBody.innerHTML = '';
  items.forEach((item, i) => addItemRow(i + 1, item));
  recalcTotals();
}

function addItemRow(pos: number, item: LineItem = { description: '', qty: 1, unitPrice: 0 }) {
  const tr = document.createElement('tr');
  tr.dataset.pos = String(pos);

  const descInput = `<input type="text" class="item-desc" value="${escHtml(item.description)}" placeholder="Leistungsbeschreibung" style="width:100%;" />`;
  const qtyInput = `<input type="text" inputmode="decimal" class="item-qty" value="${item.qty}" style="width:100%;text-align:right;" />`;
  const priceInput = `<input type="text" inputmode="decimal" class="item-price" value="${item.unitPrice}" style="width:100%;text-align:right;" />`;
  const total = eur(item.qty * item.unitPrice);

  tr.innerHTML = `
    <td style="padding-top:8px;font-size:12px;color:#6b7280;vertical-align:middle;">${pos}</td>
    <td>${descInput}</td>
    <td class="right">${qtyInput}</td>
    <td class="right">${priceInput}</td>
    <td class="right item-total" style="vertical-align:middle;font-variant-numeric:tabular-nums;">${total}</td>
    <td><button class="btn-danger remove-item-btn" title="Entfernen">×</button></td>
  `;

  tr.querySelector('.item-desc')!.addEventListener('input', markDirty);
  tr.querySelector('.item-qty')!.addEventListener('input', () => updateRow(tr));
  tr.querySelector('.item-price')!.addEventListener('input', () => updateRow(tr));
  tr.querySelector('.remove-item-btn')!.addEventListener('click', () => removeRow(tr));

  itemsBody.appendChild(tr);
}

function updateRow(tr: HTMLTableRowElement) {
  const qty = parseNum((tr.querySelector('.item-qty') as HTMLInputElement).value);
  const price = parseNum((tr.querySelector('.item-price') as HTMLInputElement).value);
  tr.querySelector('.item-total')!.textContent = eur(qty * price);
  recalcTotals();
  markDirty();
}

function removeRow(tr: HTMLTableRowElement) {
  tr.remove();
  itemsBody.querySelectorAll('tr').forEach((row, i) => {
    (row as HTMLElement).dataset.pos = String(i + 1);
    row.querySelector('td:first-child')!.textContent = String(i + 1);
  });
  recalcTotals();
  markDirty();
}

function recalcTotals() {
  let net = 0;
  itemsBody.querySelectorAll('tr').forEach(tr => {
    const qty = parseNum((tr.querySelector('.item-qty') as HTMLInputElement).value);
    const price = parseNum((tr.querySelector('.item-price') as HTMLInputElement).value);
    net += qty * price;
  });
  tNet.textContent = eur(net);
  tGross.textContent = eur(net);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseNum(s: string): number {
  // Accept German (5,5) and English (5.5) decimal notation
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

function collectItems(): LineItem[] {
  return Array.from(itemsBody.querySelectorAll('tr')).map(tr => ({
    description: (tr.querySelector('.item-desc') as HTMLInputElement).value.trim(),
    qty: parseNum((tr.querySelector('.item-qty') as HTMLInputElement).value),
    unitPrice: parseNum((tr.querySelector('.item-price') as HTMLInputElement).value),
  }));
}

// ── Invoice history ────────────────────────────────────────────────────────────
function renderHistory() {
  historyBodyRows.innerHTML = '';
  const history = [...data.history].reverse(); // newest first

  if (history.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';

  history.forEach(record => {
    const tr = document.createElement('tr');
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const period = `${monthNames[record.serviceMonth - 1]} ${record.serviceYear}`;

    tr.innerHTML = `
      <td style="font-weight:600;">${record.invoiceNumber}</td>
      <td>${escHtml(record.customerName)}</td>
      <td style="color:#6b7280;">${fmtDate(record.invoiceDate)}</td>
      <td style="color:#6b7280;">${period}</td>
      <td class="right" style="font-variant-numeric:tabular-nums;">${eur(record.total)}</td>
      <td style="text-align:right;padding-top:10px;">
        <button class="btn-load" title="Formular mit diesen Daten laden (neue Rechnungsnummer)">Laden</button>
        <button class="btn-redownload" style="margin-left:6px;" title="Original-PDF erneut herunterladen">PDF</button>
        <button class="btn-danger" style="margin-left:6px;" title="Rechnung löschen">×</button>
      </td>
    `;

    tr.querySelector('.btn-load')!.addEventListener('click', () => loadFromRecord(record));
    tr.querySelector('.btn-redownload')!.addEventListener('click', async () => {
      const pdf = await generatePDFFromRecord(record);
      downloadPDF(pdf, record.invoiceNumber);
    });
    tr.querySelector('.btn-danger')!.addEventListener('click', () => {
      data.history = data.history.filter(r => r.invoiceNumber !== record.invoiceNumber);
      // Recalculate lastInvoiceSeq for the affected customer from remaining history
      const cIdx = data.customers.findIndex(c => c.code === record.customerCode);
      if (cIdx >= 0) {
        const remaining = data.history
          .filter(r => r.customerCode === record.customerCode)
          .map(r => parseInt(r.invoiceNumber.split('-').at(-1) ?? '0', 10))
          .filter(n => !isNaN(n));
        data.customers[cIdx].lastInvoiceSeq = remaining.length > 0 ? Math.max(...remaining) : 0;
      }
      refreshInvoiceNumber();
      saveData(data);
      autoSyncToGist();
      renderHistory();
    });

    historyBodyRows.appendChild(tr);
  });
}

function loadFromRecord(record: InvoiceRecord) {
  // Switch customer dropdown if the customer exists
  const customerExists = data.customers.some(c => c.code === record.customerCode);
  if (customerExists) {
    customerSelect.value = record.customerCode;
  }

  // Fill service period and description
  serviceMonth.value = String(record.serviceMonth);
  serviceYear.value = String(record.serviceYear);
  serviceDesc.value = record.serviceDescription;

  // Today as invoice date
  invoiceDate.value = new Date().toISOString().slice(0, 10);

  // Load items
  renderItems(record.items);

  // Auto-generate next invoice number (not the old one)
  refreshInvoiceNumber();

  // Scroll to top of form
  document.getElementById('customer-select')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Events ─────────────────────────────────────────────────────────────────────
senderToggle.addEventListener('click', () => {
  const collapsed = senderToggle.classList.toggle('collapsed');
  senderBody.classList.toggle('hidden', collapsed);
});

historyToggle.addEventListener('click', () => {
  const collapsed = historyToggle.classList.toggle('collapsed');
  historyBody.classList.toggle('hidden', collapsed);
});

syncToggle.addEventListener('click', () => {
  const collapsed = syncToggle.classList.toggle('collapsed');
  syncBody.classList.toggle('hidden', collapsed);
});

newInvoiceBtn.addEventListener('click', () => {
  const code = customerSelect.value;
  if (!code) { alert('Bitte zuerst einen Kunden auswählen.'); return; }
  const year = parseInt(invoiceDate.value.slice(0, 4) || String(new Date().getFullYear()), 10);
  // Increment seq now — user is deliberately moving to the next invoice
  const { display, newSeq } = nextInvoiceNumber(data.customers, code, year);
  const cIdx = data.customers.findIndex(c => c.code === code);
  data.customers[cIdx].lastInvoiceSeq = newSeq;
  invoiceDate.value = new Date().toISOString().slice(0, 10);
  invoiceNumber.value = display;
  renderItems([{ description: '', qty: 1, unitPrice: 0 }]);
  saveData(data);
  autoSyncToGist();
});

[sName, sNif, sStreet, sPostalCity, sCountry, sIban, sSwift].forEach(el =>
  el.addEventListener('input', markDirty),
);

globalSaveBtn.addEventListener('click', () => {
  data.sender = {
    name: sName.value.trim(),
    nif: sNif.value.trim(),
    street: sStreet.value.trim(),
    postalCity: sPostalCity.value.trim(),
    country: sCountry.value.trim(),
    iban: sIban.value.trim(),
    swift: sSwift.value.trim(),
  };
  data.emailSubject = emailSubjectEl.value;
  data.emailTemplate = emailTemplateEl.value;
  data.lastUsed = {
    customerCode: customerSelect.value,
    serviceMonth: parseInt(serviceMonth.value, 10),
    serviceYear: parseInt(serviceYear.value, 10),
    serviceDescription: serviceDesc.value.trim(),
    invoiceDate: invoiceDate.value,
    items: collectItems(),
  };
  saveData(data);
  markClean();
  autoSyncToGist();
});

emailSubjectEl.addEventListener('input', markDirty);
emailTemplateEl.addEventListener('input', markDirty);

copyEmailBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(emailTemplateEl.value).then(() => {
    copyEmailBtn.textContent = '✓ Kopiert';
    setTimeout(() => { copyEmailBtn.textContent = 'Kopieren'; }, 2000);
  });
});

mailOpenBtn.addEventListener('click', () => {
  const subject = emailSubjectEl.value.trim();
  const body = emailTemplateEl.value;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

customerSelect.addEventListener('change', () => { refreshInvoiceNumber(); refreshEmailSubject(); markDirty(); });
invoiceDate.addEventListener('change', () => { refreshInvoiceNumber(); refreshEmailSubject(); markDirty(); });
serviceMonth.addEventListener('change', () => { markDirty(); });
serviceYear.addEventListener('input', () => { markDirty(); });
serviceDesc.addEventListener('input', markDirty);
invoiceNumber.addEventListener('input', () => { refreshEmailSubject(); markDirty(); });

addItemBtn.addEventListener('click', () => {
  const nextPos = itemsBody.querySelectorAll('tr').length + 1;
  addItemRow(nextPos);
  markDirty();
});

addCustomerBtn.addEventListener('click', () => {
  cCode.value = '';
  cName.value = '';
  cVatId.value = '';
  cStreet.value = '';
  cPostalCity.value = '';
  cCountry.value = 'Deutschland';
  customerModal.classList.add('open');
  cCode.focus();
});

cancelCustomerBtn.addEventListener('click', () => customerModal.classList.remove('open'));
customerModal.addEventListener('click', e => { if (e.target === customerModal) customerModal.classList.remove('open'); });

saveCustomerBtn.addEventListener('click', () => {
  const code = cCode.value.trim().toUpperCase();
  if (!code || !cName.value.trim()) {
    alert('Kürzel und Firmenname sind Pflichtfelder.');
    return;
  }
  const existing = data.customers.findIndex(c => c.code === code);
  const customer = {
    code,
    name: cName.value.trim(),
    vatId: cVatId.value.trim(),
    street: cStreet.value.trim(),
    postalCity: cPostalCity.value.trim(),
    country: cCountry.value.trim(),
    lastInvoiceSeq: existing >= 0 ? data.customers[existing].lastInvoiceSeq : 0,
  };
  if (existing >= 0) data.customers[existing] = customer;
  else data.customers.push(customer);
  saveData(data);
  refreshCustomerDropdown();
  customerSelect.value = code;
  refreshInvoiceNumber();
  customerModal.classList.remove('open');
});

generateBtn.addEventListener('click', async () => {
  const code = customerSelect.value;
  const customer = data.customers.find(c => c.code === code);
  if (!customer) { alert('Bitte zuerst einen Kunden auswählen.'); return; }
  if (!data.sender.name) { alert('Bitte zuerst die Absender-Einstellungen ausfüllen.'); return; }

  const items = collectItems();
  if (items.length === 0 || items.every(i => !i.description && i.unitPrice === 0)) {
    alert('Bitte mindestens eine Position ausfüllen.');
    return;
  }

  const numStr = invoiceNumber.value.trim();
  if (!numStr) { alert('Rechnungsnummer fehlt.'); return; }

  const dateStr = invoiceDate.value;
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const invDate = new Date(yyyy, mm - 1, dd);

  const input: InvoiceInput = {
    sender: data.sender,
    customer,
    invoiceNumber: numStr,
    invoiceDate: invDate,
    serviceMonth: parseInt(serviceMonth.value, 10),
    serviceYear: parseInt(serviceYear.value, 10),
    serviceDescription: serviceDesc.value.trim(),
    items,
  };

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generiere…';
  const pdf = await generatePDF(input);
  downloadPDF(pdf, numStr);
  generateBtn.disabled = false;
  generateBtn.textContent = 'PDF generieren & herunterladen';

  // Upsert history by invoice number (re-exporting same invoice replaces the entry)
  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const record: InvoiceRecord = {
    invoiceNumber: numStr,
    invoiceDate: dateStr,
    generatedAt: new Date().toISOString(),
    customerCode: customer.code,
    customerName: customer.name,
    customerVatId: customer.vatId,
    customerStreet: customer.street,
    customerPostalCity: customer.postalCity,
    customerCountry: customer.country,
    senderName: data.sender.name,
    senderNif: data.sender.nif,
    senderStreet: data.sender.street,
    senderPostalCity: data.sender.postalCity,
    senderCountry: data.sender.country,
    senderIban: data.sender.iban,
    senderSwift: data.sender.swift,
    serviceMonth: parseInt(serviceMonth.value, 10),
    serviceYear: parseInt(serviceYear.value, 10),
    serviceDescription: serviceDesc.value.trim(),
    items,
    total,
  };
  const existingIdx = data.history.findIndex(r => r.invoiceNumber === numStr);
  if (existingIdx >= 0) data.history[existingIdx] = record;
  else data.history.push(record);

  // Persist last used state (number stays — user clicks "Neue Rechnung" to advance)
  data.lastUsed = {
    customerCode: code,
    serviceMonth: parseInt(serviceMonth.value, 10),
    serviceYear: parseInt(serviceYear.value, 10),
    serviceDescription: serviceDesc.value.trim(),
    invoiceDate: dateStr,
    items,
  };
  saveData(data);

  renderHistory();
  // Do NOT call refreshInvoiceNumber() — number stays the same until "Neue Rechnung"
  autoSyncToGist();
});

// ── Gist sync ──────────────────────────────────────────────────────────────────
function setSyncStatus(msg: string, isError = false) {
  syncStatus.textContent = msg;
  syncStatus.style.color = isError ? '#ef4444' : '#6b7280';
  if (msg) setTimeout(() => { if (syncStatus.textContent === msg) syncStatus.textContent = ''; }, 4000);
}

function applyLoadedData(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    // ✅ KORREKTUR: Holt saubere Default-Daten und wendet die geladenen Werte drauf an
    const base = loadData();
    data = {
      sender: { ...base.sender, ...parsed.sender },
      customers: parsed.customers ?? base.customers,
      lastUsed: { ...base.lastUsed, ...parsed.lastUsed },
      history: parsed.history ?? base.history,
      emailSubject: parsed.emailSubject ?? base.emailSubject,
      emailTemplate: parsed.emailTemplate ?? base.emailTemplate,
    };
    saveData(data);
    init();
    markClean();
    return true;
  } catch {
    return false;
  }
}

async function autoSyncToGist() {
  if (!syncConfig.pat || !syncConfig.gistId) return;
  await pushGist(syncConfig, JSON.stringify(data));
}

syncSaveBtn.addEventListener('click', async () => {
  const pat = syncPatInput.value.trim();
  let gistId = syncGistIdInput.value.trim();
  const hadExistingGist = !!gistId;

  if (!pat) { setSyncStatus('Bitte PAT eingeben.', true); return; }

  if (!gistId) {
    setSyncStatus('Erstelle neuen Gist…');
    const newId = await createGist(pat);
    if (!newId) { setSyncStatus('Fehler beim Erstellen des Gists. PAT korrekt?', true); return; }
    gistId = newId;
    syncGistIdInput.value = gistId;
  }

  const config: SyncConfig = { pat, gistId };
  saveSyncConfig(config);
  syncConfig = config;

  if (!hadExistingGist) {
    // New Gist just created — push current data into it
    await pushGist(syncConfig, JSON.stringify(data));
    setSyncStatus('✓ Gist erstellt und Daten hochgeladen.');
  } else {
    // Existing Gist ID entered — pull data from it (don't overwrite)
    setSyncStatus('Lade Daten aus Gist…');
    const raw = await fetchGist(syncConfig);
    if (raw) {
      applyLoadedData(raw);
      setSyncStatus('✓ Sync eingerichtet und Daten geladen.');
    } else {
      setSyncStatus('Einstellungen gespeichert, Gist konnte nicht geladen werden.', true);
    }
  }
});

syncPullBtn.addEventListener('click', async () => {
  if (!syncConfig.pat || !syncConfig.gistId) {
    setSyncStatus('Bitte zuerst Sync-Einstellungen speichern.', true);
    return;
  }
  setSyncStatus('Lade aus Gist…');
  const raw = await fetchGist(syncConfig);
  if (!raw) { setSyncStatus('Fehler beim Laden. PAT und Gist ID prüfen.', true); return; }
  const ok = applyLoadedData(raw);
  setSyncStatus(ok ? '✓ Daten aus Gist geladen.' : 'Fehler: ungültiges Datenformat.', !ok);
});

syncPushBtn.addEventListener('click', async () => {
  if (!syncConfig.pat || !syncConfig.gistId) {
    setSyncStatus('Bitte zuerst Sync-Einstellungen speichern.', true);
    return;
  }
  setSyncStatus('Speichere in Gist…');
  const ok = await pushGist(syncConfig, JSON.stringify(data));
  setSyncStatus(ok ? '✓ In Gist gespeichert.' : 'Fehler beim Speichern.', !ok);
});

// ── Export / Import ────────────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  // Always flush pending settings changes before exporting
  if (isDirty) {
    data.sender = {
      name: sName.value.trim(), nif: sNif.value.trim(),
      street: sStreet.value.trim(), postalCity: sPostalCity.value.trim(),
      country: sCountry.value.trim(), iban: sIban.value.trim(), swift: sSwift.value.trim(),
    };
    data.emailTemplate = emailTemplateEl.value;
    saveData(data);
    markClean();
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener('change', () => {
  const file = importInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const raw = e.target?.result as string;
    const ok = applyLoadedData(raw);
    if (!ok) alert('Ungültige Datei. Nur exportierte JSON-Dateien können importiert werden.');
    importInput.value = '';
  };
  reader.readAsText(file);
});

// ── Start ──────────────────────────────────────────────────────────────────────
// On load: pre-fill sync fields, then auto-pull from Gist if configured
syncPatInput.value = syncConfig.pat;
syncGistIdInput.value = syncConfig.gistId;

if (syncConfig.pat && syncConfig.gistId) {
  fetchGist(syncConfig).then(raw => {
    if (raw) {
      applyLoadedData(raw);
      setSyncStatus('✓ Aus Gist synchronisiert.');
    }
  });
}

init();
