const STORAGE_KEY = "monthlySpendTracker:v1";
const SEED_CSV_PATH = "./data/spending.csv";
const DEFAULT_CATEGORIES = ["Groceries", "Dining", "Transport", "Utilities", "Shopping", "Health", "Travel", "Entertainment", "Rent", "Other"];
const CATEGORY_COLORS = ["#136f63", "#d9843b", "#386fa4", "#8f5b9a", "#b4413d", "#5f7f3d", "#2f7f8f", "#9a6b2f", "#6d7480", "#243b36"];
const DATE_KEYS = ["date", "transaction date", "posted date", "post date", "posting date", "purchase date", "authorized date", "trans date"];
const DESCRIPTION_KEYS = ["description", "name", "merchant", "payee", "memo", "details", "transaction", "transaction description", "original description"];
const CATEGORY_KEYS = ["category", "type", "group", "expense category"];
const SOURCE_KEYS = ["card", "account", "source", "account name", "institution", "card name"];
const AMOUNT_KEYS = ["amount", "transaction amount", "net amount", "expense amount", "spend", "total"];
const DEBIT_KEYS = ["debit", "withdrawal", "charge", "charges", "expense", "expenses", "paid out", "outflow"];
const CREDIT_KEYS = ["credit", "deposit", "payment", "income", "refund", "paid in", "inflow"];

const state = loadState();
const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  seedDefaults();
  bindEvents();
  setCurrentMonth();
  await loadSeedCsv();
  render();
});

function cacheElements() {
  Object.assign(els, {
    monthPicker: document.querySelector("#monthPicker"),
    tabs: [...document.querySelectorAll(".tab")],
    views: [...document.querySelectorAll(".view")],
    dashboardTitle: document.querySelector("#dashboardTitle"),
    sideSpent: document.querySelector("#sideSpent"),
    sideLeft: document.querySelector("#sideLeft"),
    totalSpent: document.querySelector("#totalSpent"),
    totalBudget: document.querySelector("#totalBudget"),
    remainingBudget: document.querySelector("#remainingBudget"),
    transactionCount: document.querySelector("#transactionCount"),
    budgetList: document.querySelector("#budgetList"),
    spendChart: document.querySelector("#spendChart"),
    recentTransactions: document.querySelector("#recentTransactions"),
    transactionForm: document.querySelector("#transactionForm"),
    transactionTable: document.querySelector("#transactionTable"),
    budgetForm: document.querySelector("#budgetForm"),
    budgetEditor: document.querySelector("#budgetEditor"),
    categoryOptions: document.querySelector("#categoryOptions"),
    csvInput: document.querySelector("#csvInput"),
    importStatus: document.querySelector("#importStatus"),
    importPreview: document.querySelector("#importPreview"),
    exportCsvBtn: document.querySelector("#exportCsvBtn"),
    clearMonthBtn: document.querySelector("#clearMonthBtn"),
    emptyTemplate: document.querySelector("#emptyTemplate")
  });
}

function seedDefaults() {
  if (!state.budgets || Object.keys(state.budgets).length === 0) {
    state.budgets = {
      Groceries: 500,
      Dining: 250,
      Transport: 180,
      Utilities: 220,
      Shopping: 200,
      Entertainment: 120,
      Other: 150
    };
    saveState();
  }
}

function bindEvents() {
  els.tabs.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.openView));
  });
  els.monthPicker.addEventListener("change", render);
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.budgetForm.addEventListener("submit", handleBudgetSubmit);
  els.csvInput.addEventListener("change", handleCsvFile);
  els.exportCsvBtn.addEventListener("click", exportCsvBackup);
  els.clearMonthBtn.addEventListener("click", clearSelectedMonth);
}

function setCurrentMonth() {
  const now = new Date();
  els.monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  els.transactionForm.elements.date.value = new Date().toISOString().slice(0, 10);
}

function switchView(viewName) {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === `${viewName}View`));
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const amount = Number(form.elements.amount.value);
  if (!amount || amount < 0) return;

  upsertTransactions([{
    id: crypto.randomUUID(),
    date: form.elements.date.value,
    description: form.elements.description.value.trim(),
    category: normalizeCategory(form.elements.category.value),
    amount,
    source: form.elements.source.value.trim() || "Manual"
  }]);

  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  saveState();
  render();
}

function handleBudgetSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const category = normalizeCategory(form.elements.category.value);
  const amount = Number(form.elements.amount.value);
  if (!category || amount < 0) return;

  state.budgets[category] = amount;
  form.reset();
  saveState();
  render();
}

async function handleCsvFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCsv(text);
  const imported = rows.map(mapCsvRow).filter(Boolean);
  renderImportPreview(imported);
  els.importStatus.textContent = imported.length
    ? `${imported.length} transactions ready from ${file.name}.`
    : `No usable transactions found in ${file.name}. Try exporting columns for date, merchant/description, and amount.`;
  event.target.value = "";
}

async function loadSeedCsv() {
  if (state.transactions.length > 0) return;

  try {
    const response = await fetch(SEED_CSV_PATH, { cache: "no-store" });
    if (!response.ok) return;
    const text = await response.text();
    const imported = parseCsv(text).map(mapCsvRow).filter(Boolean);
    if (!imported.length) return;
    upsertTransactions(imported);
    saveState();
    els.importStatus.textContent = `${imported.length} transactions restored from data/spending.csv.`;
  } catch {
    // Direct file opens may block fetch; manual CSV import still works.
  }
}

function exportCsvBackup() {
  const csv = transactionsToCsv(state.transactions);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spending-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.importStatus.textContent = `${state.transactions.length} transactions exported.`;
}

function clearSelectedMonth() {
  const month = els.monthPicker.value;
  const count = monthlyTransactions().length;
  if (!count) return;
  const ok = confirm(`Remove ${count} transactions from ${formatMonth(month)}?`);
  if (!ok) return;
  state.transactions = state.transactions.filter((transaction) => !transaction.date.startsWith(month));
  saveState();
  render();
}

function render() {
  const month = els.monthPicker.value;
  const transactions = monthlyTransactions();
  const byCategory = totalsByCategory(transactions);
  const spent = transactions.reduce((sum, item) => sum + item.amount, 0);
  const budgeted = Object.values(state.budgets).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const remaining = budgeted - spent;

  els.dashboardTitle.textContent = formatMonth(month);
  els.sideSpent.textContent = money(spent);
  els.sideLeft.textContent = money(remaining);
  els.sideLeft.classList.toggle("over-budget", remaining < 0);
  els.totalSpent.textContent = money(spent);
  els.totalBudget.textContent = money(budgeted);
  els.remainingBudget.textContent = money(remaining);
  els.remainingBudget.classList.toggle("over-budget", remaining < 0);
  els.transactionCount.textContent = String(transactions.length);

  renderCategoryOptions();
  renderBudgets(byCategory);
  renderBudgetEditor(byCategory);
  renderTransactions(transactions);
  renderRecent(transactions);
  drawChart(byCategory);
}

function renderCategoryOptions() {
  const categories = getCategories();
  els.categoryOptions.innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");
}

function renderBudgets(byCategory) {
  const categories = getBudgetCategories(byCategory);
  if (!categories.length) return showEmpty(els.budgetList);

  els.budgetList.innerHTML = categories.map((category) => {
    const spent = byCategory[category] || 0;
    const budget = Number(state.budgets[category] || 0);
    const percent = budget > 0 ? Math.round((spent / budget) * 100) : spent > 0 ? 100 : 0;
    const status = percent >= 100 ? "is-over" : percent >= 80 ? "is-warning" : "";
    return `
      <article class="budget-row">
        <div class="budget-meta">
          <strong>${escapeHtml(category)}</strong>
          <span class="amount-pair">${money(spent)} / ${money(budget)}</span>
        </div>
        <div class="progress-track" title="${percent}% used">
          <div class="progress-bar ${status}" style="--value:${Math.min(percent, 100)}%"></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderBudgetEditor(byCategory) {
  const categories = getBudgetCategories(byCategory);
  if (!categories.length) return showEmpty(els.budgetEditor);

  els.budgetEditor.innerHTML = `
    <table>
      <thead><tr><th>Category</th><th class="amount">Spent</th><th class="amount">Budget</th><th></th></tr></thead>
      <tbody>
        ${categories.map((category) => `
          <tr>
            <td><span class="category-chip">${escapeHtml(category)}</span></td>
            <td class="amount">${money(byCategory[category] || 0)}</td>
            <td class="amount">${money(state.budgets[category] || 0)}</td>
            <td><div class="row-actions"><button class="small-button" data-edit-budget="${escapeHtml(category)}" type="button">Edit</button><button class="small-button" data-delete-budget="${escapeHtml(category)}" type="button">Delete</button></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  els.budgetEditor.querySelectorAll("[data-edit-budget]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.editBudget;
      els.budgetForm.elements.category.value = category;
      els.budgetForm.elements.amount.value = state.budgets[category] || 0;
      els.budgetForm.elements.amount.focus();
    });
  });

  els.budgetEditor.querySelectorAll("[data-delete-budget]").forEach((button) => {
    button.addEventListener("click", () => {
      delete state.budgets[button.dataset.deleteBudget];
      saveState();
      render();
    });
  });
}

function renderTransactions(transactions) {
  if (!transactions.length) return showEmpty(els.transactionTable);
  const sorted = sortByDate(transactions);
  els.transactionTable.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Source</th><th class="amount">Amount</th><th></th></tr></thead>
      <tbody>
        ${sorted.map((transaction) => `
          <tr>
            <td>${escapeHtml(formatDate(transaction.date))}</td>
            <td>${escapeHtml(transaction.description)}</td>
            <td><span class="category-chip">${escapeHtml(transaction.category)}</span></td>
            <td>${escapeHtml(transaction.source || "")}</td>
            <td class="amount">${money(transaction.amount)}</td>
            <td><div class="row-actions"><button class="small-button" data-edit-transaction="${transaction.id}" type="button">Edit</button><button class="small-button" data-delete-transaction="${transaction.id}" type="button">Delete</button></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  els.transactionTable.querySelectorAll("[data-delete-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      state.transactions = state.transactions.filter((item) => item.id !== button.dataset.deleteTransaction);
      saveState();
      render();
    });
  });
  els.transactionTable.querySelectorAll("[data-edit-transaction]").forEach((button) => {
    button.addEventListener("click", () => editTransaction(button.dataset.editTransaction));
  });
}

function renderRecent(transactions) {
  const recent = sortByDate(transactions).slice(0, 5);
  if (!recent.length) return showEmpty(els.recentTransactions);
  els.recentTransactions.innerHTML = recent.map((transaction) => `
    <article class="transaction-item">
      <div class="transaction-meta"><strong>${escapeHtml(transaction.description)}</strong><span class="amount-pair">${money(transaction.amount)}</span></div>
      <div class="transaction-meta"><span class="muted">${escapeHtml(formatDate(transaction.date))}</span><span class="category-chip">${escapeHtml(transaction.category)}</span></div>
    </article>
  `).join("");
}

function renderImportPreview(imported) {
  if (!imported.length) return showEmpty(els.importPreview);
  els.importPreview.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Source</th><th class="amount">Amount</th><th></th></tr></thead>
      <tbody>
        ${imported.map((transaction, index) => `
          <tr>
            <td>${escapeHtml(formatDate(transaction.date))}</td>
            <td>${escapeHtml(transaction.description)}</td>
            <td><span class="category-chip">${escapeHtml(transaction.category)}</span></td>
            <td>${escapeHtml(transaction.source)}</td>
            <td class="amount">${money(transaction.amount)}</td>
            <td><div class="row-actions"><button class="small-button" data-remove-import="${index}" type="button">Remove</button></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="panel-head" style="padding:12px 14px; margin:0;"><span class="muted">${imported.length} rows detected</span><button class="primary" id="acceptImportBtn" type="button">Import</button></div>
  `;
  els.importPreview.querySelectorAll("[data-remove-import]").forEach((button) => {
    button.addEventListener("click", () => {
      imported.splice(Number(button.dataset.removeImport), 1);
      renderImportPreview(imported);
      els.importStatus.textContent = `${imported.length} transactions ready.`;
    });
  });
  els.importPreview.querySelector("#acceptImportBtn").addEventListener("click", () => {
    const added = upsertTransactions(imported);
    saveState();
    els.importStatus.textContent = `${added} new transactions imported.`;
    els.importPreview.innerHTML = "";
    render();
    switchView("dashboard");
  });
}

function editTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  els.transactionForm.elements.date.value = transaction.date;
  els.transactionForm.elements.description.value = transaction.description;
  els.transactionForm.elements.category.value = transaction.category;
  els.transactionForm.elements.amount.value = transaction.amount;
  els.transactionForm.elements.source.value = transaction.source || "";
  state.transactions = state.transactions.filter((item) => item.id !== id);
  saveState();
  render();
  els.transactionForm.elements.description.focus();
}

function drawChart(byCategory) {
  const canvas = els.spendChart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const entries = Object.entries(byCategory).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) {
    ctx.fillStyle = "#657269";
    ctx.font = "700 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No spending for this month", width / 2, height / 2);
    return;
  }
  const max = Math.max(...entries.map(([, amount]) => amount));
  entries.forEach(([category, amount], index) => {
    const y = 30 + index * 32;
    const barWidth = Math.max(8, (amount / max) * 230);
    ctx.fillStyle = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    roundRect(ctx, 145, y, barWidth, 18, 6);
    ctx.fill();
    ctx.fillStyle = "#17201c";
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(truncate(category, 16), 135, y + 14);
    ctx.textAlign = "left";
    ctx.fillText(money(amount), 145 + barWidth + 10, y + 14);
  });
}

function parseCsv(text) {
  const rawRows = [];
  let current = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      current.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      current.push(field);
      if (current.some((value) => value.trim())) rawRows.push(current);
      current = [];
      field = "";
    } else {
      field += char;
    }
  }
  current.push(field);
  if (current.some((value) => value.trim())) rawRows.push(current);
  if (!rawRows.length) return [];

  const headerIndex = findHeaderRow(rawRows);
  if (headerIndex === -1) return [];

  const headers = rawRows[headerIndex].map((header) => normalizeHeader(header));
  return rawRows.slice(headerIndex + 1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });
    return item;
  });
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headers = row.map((header) => normalizeHeader(header));
    const hasDate = headers.some((header) => DATE_KEYS.includes(header));
    const hasDescription = headers.some((header) => DESCRIPTION_KEYS.includes(header));
    const hasAmount = headers.some((header) => AMOUNT_KEYS.includes(header) || DEBIT_KEYS.includes(header) || CREDIT_KEYS.includes(header));
    return hasDate && hasAmount && (hasDescription || headers.length >= 3);
  });
}

function transactionsToCsv(transactions) {
  const headers = ["Date", "Description", "Amount", "Category", "Source"];
  const rows = sortByDate(transactions).map((transaction) => [
    transaction.date,
    transaction.description,
    Number(transaction.amount || 0).toFixed(2),
    transaction.category,
    transaction.source || ""
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function mapCsvRow(row) {
  const dateRaw = firstValue(row, DATE_KEYS);
  const date = parseDate(dateRaw);
  const description = firstValue(row, DESCRIPTION_KEYS);
  const amount = getTransactionAmount(row);
  if (!date || !description || !amount) return null;
  return {
    id: crypto.randomUUID(),
    date,
    description: description.trim(),
    category: normalizeCategory(firstValue(row, CATEGORY_KEYS) || inferCategory(description)),
    amount,
    source: firstValue(row, SOURCE_KEYS) || "CSV"
  };
}

function getTransactionAmount(row) {
  const directAmount = firstValue(row, AMOUNT_KEYS);
  if (directAmount) return Math.abs(parseMoney(directAmount));

  const debit = firstValue(row, DEBIT_KEYS);
  if (debit) return Math.abs(parseMoney(debit));

  const credit = firstValue(row, CREDIT_KEYS);
  if (credit) return Math.abs(parseMoney(credit));

  return 0;
}

function inferCategory(description) {
  const text = description.toLowerCase();
  const rules = [
    ["Groceries", ["whole foods", "trader joe", "safeway", "kroger", "grocery", "market"]],
    ["Dining", ["restaurant", "cafe", "coffee", "doordash", "ubereats", "pizza", "bar"]],
    ["Transport", ["uber", "lyft", "gas", "shell", "chevron", "parking", "transit"]],
    ["Utilities", ["electric", "water", "internet", "phone", "utility"]],
    ["Shopping", ["amazon", "target", "walmart", "costco", "store"]],
    ["Travel", ["hotel", "airlines", "airbnb", "flight"]],
    ["Entertainment", ["netflix", "spotify", "hulu", "cinema", "movie"]],
    ["Health", ["pharmacy", "doctor", "medical", "cvs", "walgreens"]]
  ];
  return rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "Other";
}

function monthlyTransactions() {
  const month = els.monthPicker.value;
  return state.transactions.filter((transaction) => transaction.date?.startsWith(month));
}

function totalsByCategory(transactions) {
  return transactions.reduce((totals, item) => {
    totals[item.category] = (totals[item.category] || 0) + Number(item.amount || 0);
    return totals;
  }, {});
}

function upsertTransactions(transactions) {
  const existing = new Set(state.transactions.map(transactionKey));
  let added = 0;
  transactions.forEach((transaction) => {
    const key = transactionKey(transaction);
    if (existing.has(key)) return;
    state.transactions.push(transaction);
    existing.add(key);
    added += 1;
  });
  return added;
}

function transactionKey(transaction) {
  return [
    transaction.date,
    normalizeForKey(transaction.description),
    normalizeForKey(transaction.category),
    Number(transaction.amount || 0).toFixed(2),
    normalizeForKey(transaction.source || "")
  ].join("|");
}

function getBudgetCategories(byCategory = {}) {
  return [...new Set([...Object.keys(state.budgets), ...Object.keys(byCategory)])].sort((a, b) => a.localeCompare(b));
}

function getCategories() {
  return [...new Set([...DEFAULT_CATEGORIES, ...Object.keys(state.budgets), ...state.transactions.map((item) => item.category)])].sort((a, b) => a.localeCompare(b));
}

function showEmpty(container) {
  container.innerHTML = "";
  container.append(els.emptyTemplate.content.cloneNode(true));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { transactions: [], budgets: {} };
  } catch {
    return { transactions: [], budgets: {} };
  }
}

function firstValue(row, keys) {
  const found = keys.find((key) => row[key] !== undefined && String(row[key]).trim() !== "");
  return found ? String(row[found]).trim() : "";
}

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeForKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCategory(value) {
  const category = String(value || "Other").trim();
  return category ? category.replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Other";
}

function parseMoney(value) {
  const text = String(value || "").trim();
  const negative = /^\(.*\)$/.test(text) || text.includes("-");
  const cleaned = text.replace(/[,$()+\s]/g, "").replace(/−/g, "-");
  const parsed = Number(cleaned.replace(/-/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return native.toISOString().slice(0, 10);
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";
  const [, month, day, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatMonth(value) {
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDate(value) {
  const [year, month, day] = value.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function sortByDate(transactions) {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
