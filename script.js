const STORAGE_KEY = "salaflow-data-v1";
const SIDEBAR_KEY = "salaflow-sidebar-collapsed";
const CONFIRM_RESET_MS = 2600;
const CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Savings", "Other"];

const state = loadState();
let calendarDate = firstOfMonth(new Date());
let pendingDelete = null;
let entryStatusTimer = null;
let lastFocusedElement = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  currency: $("#currency"), hourlyRate: $("#hourlyRate"), weekendBonus: $("#weekendBonus"), payType: $("#payType"),
  monthDay: $("#monthDay"), weekDay: $("#weekDay"), monthDayWrap: $("#monthDayWrap"), weekDayWrap: $("#weekDayWrap"),
  entryForm: $("#entryForm"), entryDate: $("#entryDate"), entryHours: $("#entryHours"), entryNote: $("#entryNote"), entryStatus: $("#entryStatus"),
  periodText: $("#periodText"), salaryText: $("#salaryText"), hoursText: $("#hoursText"), remainingText: $("#remainingText"),
  plannedRemainingText: $("#plannedRemainingText"), savingsRateText: $("#savingsRateText"),
  dailyAverageText: $("#dailyAverageText"), weeklyAverageText: $("#weeklyAverageText"), forecastText: $("#forecastText"),
  calendarTitle: $("#calendarTitle"), calendar: $("#calendar"), prevMonth: $("#prevMonth"), nextMonth: $("#nextMonth"),
  entryList: $("#entryList"), entryCount: $("#entryCount"),
  sidebar: $("#sidebar"), sidebarToggle: $("#sidebarToggle"),
  addFolder: $("#addFolder"), folderList: $("#folderList"), folderModal: $("#folderModal"), folderForm: $("#folderForm"),
  folderName: $("#folderName"), folderNote: $("#folderNote"), cancelFolder: $("#cancelFolder"), cancelFolderFooter: $("#cancelFolderFooter"),
  budgetForm: $("#budgetForm"), budgetCategory: $("#budgetCategory"), budgetAmount: $("#budgetAmount"), budgetList: $("#budgetList"),
  expenseForm: $("#expenseForm"), expenseName: $("#expenseName"), expenseCategory: $("#expenseCategory"),
  expenseAmount: $("#expenseAmount"), expenseDate: $("#expenseDate"), expenseNote: $("#expenseNote"), expenseList: $("#expenseList"),
  budgetTotalText: $("#budgetTotalText"), expenseTotalText: $("#expenseTotalText"), budgetSummary: $("#budgetSummary"),
  categoryBreakdown: $("#categoryBreakdown"), importData: $("#importData"), importFile: $("#importFile"),
  exportData: $("#exportData"), quickNotes: $("#quickNotes"),
};

init();

function init() {
  els.entryDate.value = toISO(new Date());
  els.expenseDate.value = toISO(new Date());
  syncSettingsControls();
  els.quickNotes.value = state.notes || "";
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "true");
  bindEvents();
  render();
}

function syncSettingsControls() {
  els.currency.value = state.settings.currency;
  els.hourlyRate.value = state.settings.hourlyRate;
  els.weekendBonus.value = state.settings.weekendBonus;
  els.payType.value = state.settings.payType;
  els.monthDay.value = state.settings.monthDay;
  els.weekDay.value = state.settings.weekDay;
}

function loadState() {
  const base = baseState();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return base;
    return normalizeState({ ...base, ...saved, settings: { ...base.settings, ...saved.settings } });
  } catch {
    return base;
  }
}

function baseState() {
  return {
    settings: { currency: "JPY", hourlyRate: 1140, weekendBonus: 100, payType: "monthly", monthDay: 15, weekDay: 5 },
    entries: [],
    folders: [
      { id: randomId(), name: "Last salary", note: "Compare older salary with today." },
      { id: randomId(), name: "Work memories", note: "Kitchen job, washing dishes, busy shifts." }
    ],
    budgets: [],
    expenses: [],
    notes: ""
  };
}

function normalizeState(data) {
  const base = baseState();
  const merged = {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) }
  };
  const today = toISO(new Date());
  return {
    ...merged,
    settings: {
      currency: ["JPY", "USD"].includes(merged.settings.currency) ? merged.settings.currency : base.settings.currency,
      hourlyRate: Math.max(0, Number(merged.settings.hourlyRate) || base.settings.hourlyRate),
      weekendBonus: Math.max(0, Number(merged.settings.weekendBonus) || 0),
      payType: ["monthly", "weekly"].includes(merged.settings.payType) ? merged.settings.payType : base.settings.payType,
      monthDay: clamp(Number(merged.settings.monthDay) || base.settings.monthDay, 1, 31),
      weekDay: clamp(Number(merged.settings.weekDay) || base.settings.weekDay, 0, 6)
    },
    entries: asArray(merged.entries).map((item) => ({
      id: item.id || randomId(),
      date: normalizeDate(item.date, today),
      hours: Math.max(0, Number(item.hours) || 0),
      note: item.note || ""
    })).filter((item) => item.date && item.hours > 0),
    folders: asArray(merged.folders).map((item) => ({
      id: item.id || randomId(),
      name: item.name || "Folder",
      note: item.note || ""
    })),
    budgets: asArray(merged.budgets).map((item) => ({
      id: item.id || randomId(),
      category: normalizeCategory(item.category || item.name),
      amount: Number(item.amount) || 0
    })).filter((item) => item.amount > 0),
    expenses: asArray(merged.expenses).map((item) => ({
      id: item.id || randomId(),
      name: item.name || "Expense",
      category: normalizeCategory(item.category),
      amount: Number(item.amount) || 0,
      date: normalizeDate(item.date, today),
      note: item.note || ""
    })).filter((item) => item.amount > 0),
    notes: merged.notes || ""
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  [els.currency, els.hourlyRate, els.weekendBonus, els.payType, els.monthDay, els.weekDay].forEach((field) => {
    field.addEventListener("input", () => {
      state.settings.currency = els.currency.value;
      state.settings.hourlyRate = Number(els.hourlyRate.value) || 0;
      state.settings.weekendBonus = Number(els.weekendBonus.value) || 0;
      state.settings.payType = els.payType.value;
      state.settings.monthDay = clamp(Number(els.monthDay.value) || 1, 1, 31);
      state.settings.weekDay = Number(els.weekDay.value);
      saveState();
      render();
    });
  });

  els.entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = els.entryDate.value;
    const hours = Number(els.entryHours.value);
    if (!date || hours <= 0) return;

    const existing = state.entries.find((entry) => entry.date === date);
    const status = existing ? "Entry updated" : "Entry saved";
    if (existing) {
      existing.hours = hours;
      existing.note = els.entryNote.value.trim();
    } else {
      state.entries.push({ id: randomId(), date, hours, note: els.entryNote.value.trim() });
    }

    els.entryHours.value = "";
    els.entryNote.value = "";
    saveState();
    render();
    showEntryStatus(status);
  });

  els.prevMonth.addEventListener("click", () => {
    calendarDate = addMonths(calendarDate, -1);
    renderCalendar();
  });

  els.nextMonth.addEventListener("click", () => {
    calendarDate = addMonths(calendarDate, 1);
    renderCalendar();
  });

  els.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
  });

  els.addFolder.addEventListener("click", openFolderModal);
  els.cancelFolder.addEventListener("click", closeFolderModal);
  els.cancelFolderFooter.addEventListener("click", closeFolderModal);
  els.folderModal.addEventListener("click", (event) => {
    if (event.target === els.folderModal) closeFolderModal();
  });
  els.folderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.folderName.value.trim();
    if (!name) return;
    state.folders.push({ id: randomId(), name, note: els.folderNote.value.trim() });
    saveState();
    renderFolders();
    closeFolderModal();
  });

  els.budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addBudget(els.budgetCategory.value, els.budgetAmount.value);
    els.budgetAmount.value = "";
  });

  els.expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addExpense();
    els.expenseName.value = "";
    els.expenseAmount.value = "";
    els.expenseNote.value = "";
    els.expenseDate.value = toISO(new Date());
  });

  els.quickNotes.addEventListener("input", () => {
    state.notes = els.quickNotes.value;
    saveState();
  });

  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", importJSON);
  els.exportData.addEventListener("click", exportJSON);
}

function render() {
  els.monthDayWrap.classList.toggle("hidden", state.settings.payType !== "monthly");
  els.weekDayWrap.classList.toggle("hidden", state.settings.payType !== "weekly");
  renderSummary();
  renderCalendar();
  renderEntries();
  renderFolders();
  renderMoneyLists();
  renderCategoryBreakdown();
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle.setAttribute("aria-label", collapsed ? "Show sidebar" : "Hide sidebar");
  els.sidebarToggle.title = collapsed ? "Show sidebar" : "Hide sidebar";
  els.sidebarToggle.querySelector("span").textContent = collapsed ? ">" : "<";
  localStorage.setItem(SIDEBAR_KEY, String(collapsed));
}

function openFolderModal() {
  lastFocusedElement = document.activeElement;
  els.folderName.value = "";
  els.folderNote.value = "";
  els.folderModal.classList.remove("hidden");
  document.addEventListener("keydown", trapFolderModalFocus);
  els.folderName.focus();
}

function closeFolderModal() {
  els.folderModal.classList.add("hidden");
  els.folderForm.reset();
  document.removeEventListener("keydown", trapFolderModalFocus);
  (lastFocusedElement || els.addFolder).focus();
  lastFocusedElement = null;
}

function trapFolderModalFocus(event) {
  if (event.key === "Escape") {
    closeFolderModal();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...els.folderModal.querySelectorAll("button, input, textarea, select, a[href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.disabled && element.offsetParent !== null);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!els.folderModal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showEntryStatus(message) {
  window.clearTimeout(entryStatusTimer);
  els.entryStatus.textContent = message;
  entryStatusTimer = window.setTimeout(() => {
    els.entryStatus.textContent = "";
  }, 2200);
}

function currentPeriod(today = new Date()) {
  const now = startOfDay(today);

  if (state.settings.payType === "weekly") {
    const payday = state.settings.weekDay;
    const lastPayday = addDays(now, -((now.getDay() - payday + 7) % 7));
    const end = now > lastPayday ? addDays(lastPayday, 7) : lastPayday;
    const start = addDays(end, -6);
    return { start, end };
  }

  const payday = clamp(state.settings.monthDay, 1, 31);
  const thisPayday = safeDate(now.getFullYear(), now.getMonth(), payday);
  const end = now <= thisPayday ? thisPayday : safeDate(now.getFullYear(), now.getMonth() + 1, payday);
  const previousEnd = safeDate(end.getFullYear(), end.getMonth() - 1, payday);
  const start = addDays(previousEnd, 1);
  return { start, end };
}

function includedEntries() {
  const { start, end } = currentPeriod();
  return state.entries
    .filter((entry) => isInPeriod(entry.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function periodExpenses() {
  const { start, end } = currentPeriod();
  return state.expenses
    .filter((expense) => isInPeriod(expense.date, start, end))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderSummary() {
  const { start, end } = currentPeriod();
  const totals = moneyTotals();

  els.periodText.textContent = `${shortDate(start)} - ${shortDate(end)}`;
  els.salaryText.textContent = money(totals.salary);
  els.hoursText.textContent = `${prettyNumber(totals.hours)}h`;
  els.remainingText.textContent = money(totals.afterExpenses);
  els.plannedRemainingText.textContent = money(totals.afterPlans);
  els.entryCount.textContent = `${totals.entries.length} ${totals.entries.length === 1 ? "entry" : "entries"}`;
  els.budgetTotalText.textContent = `${money(totals.budgets)} limits`;
  els.expenseTotalText.textContent = `${money(totals.expenses)} spent`;
  els.savingsRateText.textContent = `${prettyNumber(totals.savingsRate)}%`;
  els.dailyAverageText.textContent = money(totals.dailyAverage);
  els.weeklyAverageText.textContent = money(totals.weeklyAverage);
  els.forecastText.textContent = money(totals.forecastBalance);

  els.budgetSummary.textContent = totals.budgets
    ? `If every category reaches its limit, you should have ${money(totals.afterPlans)} left.`
    : `After expenses, you currently have ${money(totals.afterExpenses)} left.`;
  els.budgetSummary.classList.toggle("tight", totals.afterPlans < 0);
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const { start, end } = currentPeriod();
  const byDate = new Map(state.entries.map((entry) => [entry.date, entry]));

  els.calendarTitle.textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  els.calendar.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index);
    const iso = toISO(day);
    const entry = byDate.get(iso);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    if (day.getMonth() !== month) button.classList.add("outside");
    if (day >= start && day <= end) button.classList.add("in-cycle");
    button.innerHTML = `
      <span class="day-number">${day.getDate()}${entry ? "<span>saved</span>" : ""}</span>
      ${entry ? `<div class="day-hours">${prettyNumber(entry.hours)}h</div><div class="day-note">${escapeHTML(entry.note || "No note")}</div>` : ""}
    `;
    button.addEventListener("click", () => {
      els.entryDate.value = iso;
      els.entryHours.value = entry ? entry.hours : "";
      els.entryNote.value = entry ? entry.note : "";
      els.entryHours.focus();
    });
    els.calendar.append(button);
  }
}

function renderEntries() {
  const entries = includedEntries();
  els.entryList.innerHTML = entries.length ? "" : `<div class="empty">No work entries in this salary period yet.</div>`;
  entries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${longDate(fromISO(entry.date))}</strong><button class="delete" type="button" aria-label="Delete work entry">×</button></div>
      <div class="meta">${prettyNumber(entry.hours)} hours × ${money(rateForDate(entry.date))} - ${money(entryPay(entry))}</div>
      <div>${escapeHTML(entry.note || "No note added")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "entries", entry.id));
    els.entryList.append(item);
  });
}

function renderFolders() {
  els.folderList.innerHTML = "";
  state.folders.forEach((folder) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(folder.name)}</strong><button class="delete" type="button" aria-label="Delete note folder">×</button></div>
      <div class="meta">${escapeHTML(folder.note || "No note")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "folders", folder.id));
    els.folderList.append(item);
  });
}

function renderMoneyLists() {
  renderBudgetList();
  renderExpenseList();
}

function renderBudgetList() {
  const expensesByCategory = categoryTotals(periodExpenses());
  els.budgetList.innerHTML = state.budgets.length ? "" : `<div class="empty">No category limits yet.</div>`;

  state.budgets.forEach((budget) => {
    const spent = expensesByCategory.get(budget.category) || 0;
    const percent = budget.amount ? Math.min((spent / budget.amount) * 100, 100) : 0;
    const remaining = budget.amount - spent;
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(budget.category)}</strong><button class="delete" type="button" aria-label="Delete budget limit">×</button></div>
      <div class="meta">${money(spent)} spent of ${money(budget.amount)}</div>
      <div class="progress"><span style="width: ${percent}%"></span></div>
      <div class="${remaining >= 0 ? "fit" : "tight"}">${remaining >= 0 ? `${money(remaining)} left` : `${money(Math.abs(remaining))} over limit`}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "budgets", budget.id));
    els.budgetList.append(item);
  });
}

function renderExpenseList() {
  const expenses = periodExpenses();
  els.expenseList.innerHTML = expenses.length ? "" : `<div class="empty">No expenses in this salary period yet.</div>`;

  expenses.forEach((expense) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(expense.name)}</strong><button class="delete" type="button" aria-label="Delete expense">×</button></div>
      <div class="meta">${money(expense.amount)} - ${escapeHTML(expense.category)} - ${longDate(fromISO(expense.date))}</div>
      <div>${escapeHTML(expense.note || "No note added")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "expenses", expense.id));
    els.expenseList.append(item);
  });
}

function renderCategoryBreakdown() {
  const expenses = periodExpenses();
  const totals = categoryTotals(expenses);
  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  els.categoryBreakdown.innerHTML = totalSpent ? "" : `<div class="empty">Add categorized expenses to see your spending pattern.</div>`;

  [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([category, amount]) => {
    const percent = totalSpent ? (amount / totalSpent) * 100 : 0;
    const row = document.createElement("article");
    row.className = "breakdown-row";
    row.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(category)}</strong><span>${money(amount)} - ${prettyNumber(percent)}%</span></div>
      <div class="progress"><span style="width: ${Math.min(percent, 100)}%"></span></div>
    `;
    els.categoryBreakdown.append(row);
  });
}

function addBudget(category, amount) {
  const parsed = Number(amount);
  if (!category || parsed <= 0) return;
  const existing = state.budgets.find((budget) => budget.category === category);
  if (existing) {
    existing.amount = parsed;
  } else {
    state.budgets.push({ id: randomId(), category, amount: parsed });
  }
  saveState();
  render();
}

function addExpense() {
  const amount = Number(els.expenseAmount.value);
  if (!els.expenseName.value.trim() || amount <= 0 || !els.expenseDate.value) return;
  state.expenses.push({
    id: randomId(),
    name: els.expenseName.value.trim(),
    category: normalizeCategory(els.expenseCategory.value),
    amount,
    date: els.expenseDate.value,
    note: els.expenseNote.value.trim()
  });
  saveState();
  render();
}

function confirmDelete(button, key, id) {
  const token = `${key}:${id}`;
  if (pendingDelete === token) {
    pendingDelete = null;
    removeItem(key, id);
    return;
  }

  document.querySelectorAll(".delete.confirming").forEach((item) => {
    item.textContent = "×";
    item.classList.remove("confirming");
  });

  pendingDelete = token;
  button.textContent = "Confirm";
  button.classList.add("confirming");

  window.setTimeout(() => {
    if (pendingDelete !== token) return;
    pendingDelete = null;
    if (!button.isConnected) return;
    button.textContent = "×";
    button.classList.remove("confirming");
  }, CONFIRM_RESET_MS);
}

function removeItem(key, id) {
  state[key] = state[key].filter((item) => item.id !== id);
  saveState();
  render();
}

function moneyTotals() {
  const entries = includedEntries();
  const expensesList = periodExpenses();
  const { start, end } = currentPeriod();
  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const salary = entries.reduce((sum, entry) => sum + entryPay(entry), 0);
  const expenses = expensesList.reduce((sum, item) => sum + item.amount, 0);
  const budgets = state.budgets.reduce((sum, item) => sum + item.amount, 0);
  const afterExpenses = salary - expenses;
  const afterPlans = salary - budgets;
  const daysElapsed = Math.max(1, daysBetween(start, minDate(startOfDay(new Date()), end)) + 1);
  const periodDays = Math.max(1, daysBetween(start, end) + 1);
  const dailyAverage = expenses / daysElapsed;
  const weeklyAverage = dailyAverage * 7;
  const forecastExpenses = dailyAverage * periodDays;
  const forecastBalance = salary - forecastExpenses;
  const savingsRate = salary > 0 ? (afterExpenses / salary) * 100 : 0;

  return {
    entries, expensesList, hours, salary, expenses, budgets,
    afterExpenses, afterPlans, dailyAverage, weeklyAverage, forecastBalance,
    savingsRate: clamp(savingsRate, -999, 999)
  };
}

function entryPay(entry) {
  return entry.hours * rateForDate(entry.date);
}

function rateForDate(isoDate) {
  return state.settings.hourlyRate + (isWeekend(isoDate) ? state.settings.weekendBonus : 0);
}

function isWeekend(isoDate) {
  const day = fromISO(isoDate).getDay();
  return day === 0 || day === 6;
}

function categoryTotals(expenses) {
  return expenses.reduce((map, expense) => {
    map.set(expense.category, (map.get(expense.category) || 0) + expense.amount);
    return map;
  }, new Map());
}

function exportJSON() {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `salaflow-export-${toISO(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importJSON(event) {
  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      replaceState(normalizeState(parsed));
      saveState();
      syncSettingsControls();
      els.quickNotes.value = state.notes || "";
      render();
      showEntryStatus("Import complete");
    } catch {
      showEntryStatus("Import failed");
    } finally {
      els.importFile.value = "";
    }
  });
  reader.addEventListener("error", () => {
    els.importFile.value = "";
    showEntryStatus("Import failed");
  });
  reader.readAsText(file);
}

function replaceState(nextState) {
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, nextState);
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency,
    maximumFractionDigits: state.settings.currency === "JPY" ? 0 : 2
  }).format(value);
}

function safeDate(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function fromISO(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function shortDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function longDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function prettyNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(start, end) {
  return Math.round((startOfDay(end) - startOfDay(start)) / 86400000);
}

function minDate(first, second) {
  return first <= second ? first : second;
}

function isInPeriod(isoDate, start, end) {
  const date = fromISO(isoDate);
  return date >= start && date <= end;
}

function normalizeCategory(value) {
  return CATEGORIES.includes(value) ? value : "Other";
}

function normalizeDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function randomId() {
  return globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
