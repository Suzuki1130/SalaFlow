const STORAGE_KEY = "salaflow-data-v1";
const SIDEBAR_KEY = "salaflow-sidebar-collapsed";
const THEME_KEY = "salaflow-theme";
const CONFIRM_RESET_MS = 2600;
const CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Savings", "Other"];

const state = loadState();
let calendarDate = firstOfMonth(new Date());
let planningDate = firstOfMonth(new Date());
let selectedPlanDate = toISO(new Date());
let pendingDelete = null;
let entryStatusTimer = null;
let planStatusTimer = null;
let lastFocusedElement = null;
let activeModal = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  currency: $("#currency"), hourlyRate: $("#hourlyRate"), weekendBonus: $("#weekendBonus"), payType: $("#payType"),
  monthDay: $("#monthDay"), weekDay: $("#weekDay"), monthDayWrap: $("#monthDayWrap"), weekDayWrap: $("#weekDayWrap"),
  entryForm: $("#entryForm"), entryDate: $("#entryDate"), entryHours: $("#entryHours"), entryNote: $("#entryNote"), entryStatus: $("#entryStatus"),
  periodText: $("#periodText"), salaryText: $("#salaryText"), hoursText: $("#hoursText"), remainingText: $("#remainingText"),
  monthSalaryText: $("#monthSalaryText"), plannedRemainingText: $("#plannedRemainingText"), savingsRateText: $("#savingsRateText"),
  dailyAverageText: $("#dailyAverageText"), weeklyAverageText: $("#weeklyAverageText"), forecastText: $("#forecastText"),
  calendarTitle: $("#calendarTitle"), calendar: $("#calendar"), prevMonth: $("#prevMonth"), nextMonth: $("#nextMonth"),
  entryList: $("#entryList"), entryCount: $("#entryCount"),
  sidebar: $("#sidebar"), sidebarToggle: $("#sidebarToggle"),
  addFolder: $("#addFolder"), folderList: $("#folderList"), folderModal: $("#folderModal"), folderForm: $("#folderForm"),
  folderInfo: $("#folderInfo"), folderInfoModal: $("#folderInfoModal"), closeFolderInfo: $("#closeFolderInfo"),
  closeFolderInfoFooter: $("#closeFolderInfoFooter"),
  folderName: $("#folderName"), folderNote: $("#folderNote"), cancelFolder: $("#cancelFolder"), cancelFolderFooter: $("#cancelFolderFooter"),
  budgetForm: $("#budgetForm"), budgetCategory: $("#budgetCategory"), budgetAmount: $("#budgetAmount"), budgetList: $("#budgetList"),
  expenseForm: $("#expenseForm"), expenseName: $("#expenseName"), expenseCategory: $("#expenseCategory"),
  expenseAmount: $("#expenseAmount"), expenseDate: $("#expenseDate"), expenseNote: $("#expenseNote"), expenseList: $("#expenseList"),
  budgetTotalText: $("#budgetTotalText"), expenseTotalText: $("#expenseTotalText"), budgetSummary: $("#budgetSummary"),
  earningsChart: $("#earningsChart"),
  quickNotes: $("#quickNotes"), currentFolderBadge: $("#currentFolderBadge"),
  dashboard: $("#dashboard"), calendarPlanning: $("#calendarPlanning"), navLinks: document.querySelectorAll(".nav a"),
  themeToggle: $("#themeToggle"), themeToggleText: $("#themeToggleText"),
  planningMonthBadge: $("#planningMonthBadge"), planningCalendarTitle: $("#planningCalendarTitle"),
  planningCalendar: $("#planningCalendar"), prevPlanningMonth: $("#prevPlanningMonth"), nextPlanningMonth: $("#nextPlanningMonth"),
  planForm: $("#planForm"), planDate: $("#planDate"), planTitle: $("#planTitle"), planSpending: $("#planSpending"),
  planBudget: $("#planBudget"), planNotes: $("#planNotes"), planStatus: $("#planStatus"),
  selectedPlanDateTitle: $("#selectedPlanDateTitle"), dayPlanListTitle: $("#dayPlanListTitle"),
  dayPlanCount: $("#dayPlanCount"), dayPlanList: $("#dayPlanList"),
};

init();

function init() {
  els.entryDate.value = toISO(new Date());
  els.expenseDate.value = toISO(new Date());
  els.planDate.value = selectedPlanDate;
  syncFolderControls();
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "true");
  bindEvents();
  routeFromHash();
  render();
}

function activeFolder() {
  let folder = state.folders.find((item) => item.id === state.activeFolderId);
  if (!folder) {
    folder = state.folders[0];
    if (folder) state.activeFolderId = folder.id;
  }
  return folder;
}

function syncFolderControls() {
  const folder = activeFolder();
  if (!folder) return;

  els.currency.value = folder.settings.currency;
  els.hourlyRate.value = folder.settings.hourlyRate;
  els.weekendBonus.value = folder.settings.weekendBonus;
  els.payType.value = folder.settings.payType;
  els.monthDay.value = folder.settings.monthDay;
  els.weekDay.value = folder.settings.weekDay;
  els.quickNotes.value = folder.notes || "";
  els.currentFolderBadge.textContent = folder.name;
}

function loadState() {
  const base = baseState();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return base;
    return normalizeState(saved);
  } catch {
    return base;
  }
}

function baseSettings(settings = {}) {
  return {
    currency: ["JPY", "USD"].includes(settings.currency) ? settings.currency : "JPY",
    hourlyRate: Math.max(0, Number(settings.hourlyRate) || 1140),
    weekendBonus: Math.max(0, Number(settings.weekendBonus) || 100),
    payType: ["monthly", "weekly"].includes(settings.payType) ? settings.payType : "monthly",
    monthDay: clamp(Number(settings.monthDay) || 15, 1, 31),
    weekDay: clamp(Number(settings.weekDay) || 5, 0, 6)
  };
}

function createWorkspaceFolder(folder = {}) {
  return {
    id: folder.id || randomId(),
    name: folder.name || "Folder",
    note: folder.note || "",
    settings: baseSettings(folder.settings),
    entries: normalizeEntries(folder.entries),
    budgets: normalizeBudgets(folder.budgets),
    expenses: normalizeExpenses(folder.expenses),
    notes: folder.notes || ""
  };
}

function baseState() {
  const first = createWorkspaceFolder({ name: "Main salary", note: "Your current salary plan." });
  const repeat = createWorkspaceFolder({ name: "Repeat", note: "A separate folder for recurring salary planning." });
  return {
    folders: [first, repeat],
    activeFolderId: first.id,
    plans: []
  };
}

function normalizeState(data) {
  const base = baseState();
  let folders = [];

  if (Array.isArray(data.folders) && data.folders.length) {
    folders = data.folders.map((folder) => normalizeWorkspaceFolder(folder, data));
  } else {
    const migrated = createWorkspaceFolder({
      name: "Main salary",
      note: "Migrated current salary data.",
      settings: data.settings,
      entries: data.entries,
      budgets: data.budgets,
      expenses: data.expenses,
      notes: data.notes
    });
    folders = [migrated];
  }

  if (!folders.length) {
    folders = base.folders;
  }

  const activeFolderId = folders.some((folder) => folder.id === data.activeFolderId)
    ? data.activeFolderId
    : folders[0].id;

  return { folders, activeFolderId, plans: normalizePlans(data.plans) };
}

function normalizeWorkspaceFolder(folder, rootData) {
  const hasWorkspaceFields = folder.settings || folder.expenses || folder.budgets || folder.entries || folder.notes;
  if (hasWorkspaceFields) {
    return createWorkspaceFolder(folder);
  }

  return createWorkspaceFolder({
    id: folder.id,
    name: folder.name,
    note: folder.note,
    settings: rootData.settings,
    entries: folder.entries || folder.expenseItems ? folder.entries : [],
    budgets: folder.budgets || [],
    expenses: folder.expenseItems || [],
    notes: folder.folderNotes || ""
  });
}

function normalizeEntries(entries) {
  const today = toISO(new Date());
  return asArray(entries).map((item) => ({
    id: item.id || randomId(),
    date: normalizeDate(item.date, today),
    hours: Math.max(0, Number(item.hours) || 0),
    note: item.note || ""
  })).filter((item) => item.date && item.hours > 0);
}

function normalizeBudgets(budgets) {
  return asArray(budgets).map((item) => ({
    id: item.id || randomId(),
    category: normalizeCategory(item.category || item.name),
    amount: Math.max(0, Number(item.amount) || 0)
  })).filter((item) => item.amount > 0);
}

function normalizeExpenses(expenses) {
  const today = toISO(new Date());
  return asArray(expenses).map((item) => ({
    id: item.id || randomId(),
    name: item.name || "Expense",
    category: normalizeCategory(item.category),
    amount: Math.max(0, Number(item.amount) || 0),
    date: normalizeDate(item.date, today),
    note: item.note || ""
  })).filter((item) => item.amount > 0);
}

function normalizePlans(plans) {
  const today = toISO(new Date());
  return asArray(plans).map((item) => ({
    id: item.id || randomId(),
    date: normalizeDate(item.date, today),
    title: String(item.title || item.name || "Plan").trim() || "Plan",
    spending: Math.max(0, Number(item.spending) || 0),
    budget: Math.max(0, Number(item.budget) || 0),
    notes: String(item.notes || item.note || "").trim()
  })).filter((item) => item.date && item.title);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  window.addEventListener("hashchange", routeFromHash);
  els.navLinks.forEach((link) => link.addEventListener("click", () => {
    if (!link.getAttribute("href").startsWith("#calendarPlanning")) showView("dashboard");
  }));

  els.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  [els.currency, els.hourlyRate, els.weekendBonus, els.payType, els.monthDay, els.weekDay].forEach((field) => {
    field.addEventListener("input", () => {
      const folder = activeFolder();
      folder.settings.currency = els.currency.value;
      folder.settings.hourlyRate = Number(els.hourlyRate.value) || 0;
      folder.settings.weekendBonus = Number(els.weekendBonus.value) || 0;
      folder.settings.payType = els.payType.value;
      folder.settings.monthDay = clamp(Number(els.monthDay.value) || 1, 1, 31);
      folder.settings.weekDay = Number(els.weekDay.value);
      saveState();
      render();
    });
  });

  els.entryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const folder = activeFolder();
    const date = els.entryDate.value;
    const hours = Number(els.entryHours.value);
    if (!date || !Number.isFinite(hours) || hours <= 0) {
      showEntryStatus("Add a valid date and hours");
      return;
    }

    const existing = folder.entries.find((entry) => entry.date === date);
    const status = existing ? "Entry updated" : "Entry saved";
    if (existing) {
      existing.hours = hours;
      existing.note = els.entryNote.value.trim();
    } else {
      folder.entries.push({ id: randomId(), date, hours, note: els.entryNote.value.trim() });
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

  els.prevPlanningMonth.addEventListener("click", () => {
    planningDate = addMonths(planningDate, -1);
    renderPlanningCalendar();
  });

  els.nextPlanningMonth.addEventListener("click", () => {
    planningDate = addMonths(planningDate, 1);
    renderPlanningCalendar();
  });

  els.sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
  });

  els.addFolder.addEventListener("click", openFolderModal);
  els.folderInfo.addEventListener("click", openFolderInfoModal);
  els.cancelFolder.addEventListener("click", closeFolderModal);
  els.cancelFolderFooter.addEventListener("click", closeFolderModal);
  els.folderModal.addEventListener("click", (event) => {
    if (event.target === els.folderModal) closeFolderModal();
  });
  els.folderInfoModal.addEventListener("click", (event) => {
    if (event.target === els.folderInfoModal) closeFolderInfoModal();
  });
  els.closeFolderInfo.addEventListener("click", closeFolderInfoModal);
  els.closeFolderInfoFooter.addEventListener("click", closeFolderInfoModal);
  els.folderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createFolderFromModal();
  });

  els.budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (addBudget(els.budgetCategory.value, els.budgetAmount.value)) {
      els.budgetAmount.value = "";
      showEntryStatus("Budget saved");
    } else {
      showEntryStatus("Add a valid budget amount");
    }
  });

  els.expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (addExpense()) {
      els.expenseName.value = "";
      els.expenseAmount.value = "";
      els.expenseNote.value = "";
      els.expenseDate.value = toISO(new Date());
      showEntryStatus("Expense saved");
    } else {
      showEntryStatus("Add a name, date, and valid amount");
    }
  });

  els.quickNotes.addEventListener("input", () => {
    const folder = activeFolder();
    folder.notes = els.quickNotes.value;
    saveState();
  });

  els.planDate.addEventListener("input", () => {
    if (!els.planDate.value) return;
    selectedPlanDate = els.planDate.value;
    planningDate = firstOfMonth(fromISO(selectedPlanDate));
    renderPlanning();
  });

  els.planForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPlan();
  });

  document.addEventListener("keydown", handleModalKeydown);
}

function render() {
  syncFolderControls();
  els.monthDayWrap.classList.toggle("hidden", activeFolder().settings.payType !== "monthly");
  els.weekDayWrap.classList.toggle("hidden", activeFolder().settings.payType !== "weekly");
  renderSummary();
  renderCalendar();
  renderEntries();
  renderFolders();
  renderMoneyLists();
  renderEarningsChart();
  renderPlanning();
}

function routeFromHash() {
  const hash = window.location.hash || "#dashboard";
  const planning = hash === "#calendarPlanning";
  showView(planning ? "calendarPlanning" : "dashboard");

  if (!planning && hash !== "#dashboard") {
    const target = document.querySelector(hash);
    if (target) window.setTimeout(() => target.scrollIntoView({ block: "start" }), 0);
  }
}

function showView(view) {
  const planning = view === "calendarPlanning";
  els.dashboard.classList.toggle("hidden", planning);
  els.calendarPlanning.classList.toggle("hidden", !planning);
  if (planning) window.scrollTo({ top: 0 });
  els.navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", planning ? href === "#calendarPlanning" : href === "#dashboard");
  });
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem(THEME_KEY, normalized);
  els.themeToggle.setAttribute("aria-pressed", String(normalized === "dark"));
  els.themeToggleText.textContent = normalized === "dark" ? "Light mode" : "Dark mode";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", normalized === "dark" ? "#141b19" : "#f5fbf8");
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
  activeModal = "folder";
  els.folderName.focus();
}

function openFolderInfoModal() {
  lastFocusedElement = document.activeElement;
  els.folderInfoModal.classList.remove("hidden");
  activeModal = "folder-info";
  els.closeFolderInfo.focus();
}

function closeFolderModal() {
  els.folderModal.classList.add("hidden");
  els.folderForm.reset();
  if (activeModal === "folder") activeModal = null;
  (lastFocusedElement || els.addFolder).focus();
  lastFocusedElement = null;
}

function closeFolderInfoModal() {
  els.folderInfoModal.classList.add("hidden");
  if (activeModal === "folder-info") activeModal = null;
  (lastFocusedElement || els.folderInfo).focus();
  lastFocusedElement = null;
}

function handleModalKeydown(event) {
  if (event.key !== "Escape") return;
  if (activeModal === "folder") closeFolderModal();
  if (activeModal === "folder-info") closeFolderInfoModal();
}

function createFolderFromModal() {
  const name = els.folderName.value.trim();
  if (!name) return;

  const folder = createWorkspaceFolder({
    name,
    note: els.folderNote.value.trim()
  });

  state.folders.push(folder);
  state.activeFolderId = folder.id;
  saveState();
  closeFolderModal();
  render();
}

function switchFolder(folderId) {
  if (state.activeFolderId === folderId) return;
  state.activeFolderId = folderId;
  calendarDate = firstOfMonth(new Date());
  saveState();
  render();
}

function showEntryStatus(message) {
  window.clearTimeout(entryStatusTimer);
  els.entryStatus.textContent = message;
  entryStatusTimer = window.setTimeout(() => {
    els.entryStatus.textContent = "";
  }, 2200);
}

function currentPeriod(today = new Date()) {
  const folder = activeFolder();
  const now = startOfDay(today);

  if (folder.settings.payType === "weekly") {
    const payday = folder.settings.weekDay;
    const lastPayday = addDays(now, -((now.getDay() - payday + 7) % 7));
    const end = now > lastPayday ? addDays(lastPayday, 7) : lastPayday;
    const start = addDays(end, -6);
    return { start, end };
  }

  const payday = clamp(folder.settings.monthDay, 1, 31);
  const thisPayday = safeDate(now.getFullYear(), now.getMonth(), payday);
  const end = now <= thisPayday ? thisPayday : safeDate(now.getFullYear(), now.getMonth() + 1, payday);
  const previousEnd = safeDate(end.getFullYear(), end.getMonth() - 1, payday);
  const start = addDays(previousEnd, 1);
  return { start, end };
}

function includedEntries(folder = activeFolder()) {
  const { start, end } = currentPeriod();
  return folder.entries
    .filter((entry) => isInPeriod(entry.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function periodExpenses(folder = activeFolder()) {
  const { start, end } = currentPeriod();
  return folder.expenses
    .filter((expense) => isInPeriod(expense.date, start, end))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderSummary() {
  const { start, end } = currentPeriod();
  const totals = moneyTotals();

  els.periodText.textContent = `${shortDate(start)} - ${shortDate(end)}`;
  els.salaryText.textContent = money(totals.salary);
  els.monthSalaryText.textContent = money(monthEarnings());
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
  const folder = activeFolder();
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const { start, end } = currentPeriod();
  const byDate = new Map(folder.entries.map((entry) => [entry.date, entry]));

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

function renderPlanning() {
  renderPlanningCalendar();
  renderDayPlans();
}

function renderPlanningCalendar() {
  const year = planningDate.getFullYear();
  const month = planningDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const plansByDate = plansGroupedByDate();

  els.planningCalendarTitle.textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  els.planningMonthBadge.textContent = `${state.plans.filter((plan) => {
    const date = fromISO(plan.date);
    return date.getFullYear() === year && date.getMonth() === month;
  }).length} monthly plans`;
  els.planningCalendar.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index);
    const iso = toISO(day);
    const plans = plansByDate.get(iso) || [];
    const firstPlan = plans[0];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    if (day.getMonth() !== month) button.classList.add("outside");
    if (iso === selectedPlanDate) button.classList.add("selected");
    button.innerHTML = `
      <span class="day-number">${day.getDate()}${plans.length ? `<span class="planning-day-dot">${plans.length}</span>` : ""}</span>
      ${firstPlan ? `<div class="plan-preview"><strong>${escapeHTML(firstPlan.title)}</strong><span>${planMoneyPreview(plans)}</span></div>` : ""}
    `;
    button.addEventListener("click", () => selectPlanDate(iso));
    els.planningCalendar.append(button);
  }
}

function renderDayPlans() {
  const date = fromISO(selectedPlanDate);
  const plans = state.plans
    .filter((plan) => plan.date === selectedPlanDate)
    .sort((a, b) => a.title.localeCompare(b.title));

  els.planDate.value = selectedPlanDate;
  els.selectedPlanDateTitle.textContent = `Plan ${longDate(date)}`;
  els.dayPlanListTitle.textContent = `Plans for ${longDate(date)}`;
  els.dayPlanCount.textContent = `${plans.length} ${plans.length === 1 ? "plan" : "plans"}`;
  els.dayPlanList.innerHTML = plans.length ? "" : `<div class="empty">No plans for this date yet. Add one with the form above.</div>`;

  plans.forEach((plan) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(plan.title)}</strong><button class="delete" type="button" aria-label="Delete plan">x</button></div>
      <div class="plan-money-row">
        <span class="chip">Expected ${money(plan.spending)}</span>
        <span class="chip">Budget ${money(plan.budget)}</span>
      </div>
      <div>${escapeHTML(plan.notes || "No reminder added")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "plans", plan.id));
    els.dayPlanList.append(item);
  });
}

function renderEntries() {
  const entries = includedEntries();
  els.entryList.innerHTML = entries.length ? "" : `<div class="empty">No work entries in this folder for the current salary period yet.</div>`;
  entries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${longDate(fromISO(entry.date))}</strong><button class="delete" type="button" aria-label="Delete work entry">x</button></div>
      <div class="meta">${prettyNumber(entry.hours)} hours x ${money(rateForDate(entry.date))} - ${money(entryPay(entry))}</div>
      <div>${escapeHTML(entry.note || "No note added")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "entries", entry.id));
    els.entryList.append(item);
  });
}

function renderFolders() {
  const currentId = state.activeFolderId;
  els.folderList.innerHTML = state.folders.length ? "" : `<div class="empty">Create a folder to start a salary workspace.</div>`;

  state.folders.forEach((folder) => {
    const totals = folderTotals(folder);
    const item = document.createElement("article");
    item.className = `item folder-card${folder.id === currentId ? " active-folder" : ""}`;
    item.innerHTML = `
      <div class="item-top">
        <button class="folder-link" type="button">${escapeHTML(folder.name)}</button>
        <button class="delete" type="button" aria-label="Delete folder">x</button>
      </div>
      <div class="meta">${escapeHTML(folder.note || "Separate salary workspace")}</div>
      <div class="folder-stats">
        <span><strong>${money(totals.salary)}</strong> salary</span>
        <span><strong>${prettyNumber(totals.hours)}h</strong> hours</span>
        <span><strong>${money(totals.expenses)}</strong> expenses</span>
      </div>
      <div class="folder-chips">
        <span class="chip">${folder.entries.length} ${folder.entries.length === 1 ? "work entry" : "work entries"}</span>
        <span class="chip">${folder.budgets.length} ${folder.budgets.length === 1 ? "budget" : "budgets"}</span>
        <span class="chip">${folder.expenses.length} ${folder.expenses.length === 1 ? "expense" : "expenses"}</span>
      </div>
      <div class="folder-actions">
        <button class="open-folder-button" type="button">${folder.id === currentId ? "Opened" : "Open folder"}</button>
      </div>
    `;
    item.querySelector(".folder-link").addEventListener("click", () => switchFolder(folder.id));
    item.querySelector(".open-folder-button").addEventListener("click", () => switchFolder(folder.id));
    item.querySelector(".delete").addEventListener("click", (event) => confirmDelete(event.currentTarget, "folders", folder.id));
    els.folderList.append(item);
  });
}

function renderMoneyLists() {
  renderBudgetList();
  renderExpenseList();
}

function renderBudgetList() {
  const folder = activeFolder();
  const expensesByCategory = categoryTotals(periodExpenses(folder));
  els.budgetList.innerHTML = folder.budgets.length ? "" : `<div class="empty">No category limits in this folder yet.</div>`;

  folder.budgets.forEach((budget) => {
    const spent = expensesByCategory.get(budget.category) || 0;
    const percent = budget.amount ? Math.min((spent / budget.amount) * 100, 100) : 0;
    const remaining = budget.amount - spent;
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(budget.category)}</strong><button class="delete" type="button" aria-label="Delete budget limit">x</button></div>
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
  els.expenseList.innerHTML = expenses.length ? "" : `<div class="empty">No expenses in this folder for the current salary period yet.</div>`;

  expenses.forEach((expense) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-top"><strong>${escapeHTML(expense.name)}</strong><button class="delete" type="button" aria-label="Delete expense">x</button></div>
      <div class="meta">${money(expense.amount)} - ${escapeHTML(expense.category)} - ${longDate(fromISO(expense.date))}</div>
      <div>${escapeHTML(expense.note || "No note added")}</div>
    `;
    item.querySelector("button").addEventListener("click", (event) => confirmDelete(event.currentTarget, "expenses", expense.id));
    els.expenseList.append(item);
  });
}

function renderEarningsChart() {
  const entries = includedEntries();
  const latest = entries.at(-1);
  els.earningsChart.innerHTML = latest
    ? ""
    : `<div class="empty">Add work entries to see your latest earning here.</div>`;

  if (!latest) return;

  const amount = entryPay(latest);
  const previous = entries.at(-2);
  const previousAmount = previous ? entryPay(previous) : 0;
  const change = previous ? amount - previousAmount : 0;
  const changeText = previous
    ? `${change >= 0 ? "+" : "-"}${money(Math.abs(change))} vs previous`
    : "First entry this period";
  const percent = previousAmount ? clamp((amount / previousAmount) * 100, 8, 180) : 100;

  const item = document.createElement("article");
  item.className = "latest-earning";
  item.innerHTML = `
    <div class="latest-copy">
      <span>Latest earning</span>
      <strong>${money(amount)}</strong>
      <p>${longDate(fromISO(latest.date))} · ${prettyNumber(latest.hours)} hours</p>
      <p class="${change >= 0 ? "fit" : "tight"}">${changeText}</p>
    </div>
    <div class="latest-meter" aria-hidden="true">
      <div class="latest-meter-fill" style="width: ${percent}%"></div>
    </div>
    <div class="latest-note">${escapeHTML(latest.note || "No note added")}</div>
    `;
  els.earningsChart.append(item);
}

function addBudget(category, amount) {
  const folder = activeFolder();
  const parsed = Number(amount);
  if (!category || !Number.isFinite(parsed) || parsed <= 0) return false;
  const existing = folder.budgets.find((budget) => budget.category === category);
  if (existing) {
    existing.amount = parsed;
  } else {
    folder.budgets.push({ id: randomId(), category, amount: parsed });
  }
  saveState();
  render();
  return true;
}

function addExpense() {
  const folder = activeFolder();
  const amount = Number(els.expenseAmount.value);
  if (!els.expenseName.value.trim() || !Number.isFinite(amount) || amount <= 0 || !els.expenseDate.value) return false;
  folder.expenses.push({
    id: randomId(),
    name: els.expenseName.value.trim(),
    category: normalizeCategory(els.expenseCategory.value),
    amount,
    date: els.expenseDate.value,
    note: els.expenseNote.value.trim()
  });
  saveState();
  render();
  return true;
}

function addPlan() {
  const title = els.planTitle.value.trim();
  const date = els.planDate.value;
  const spending = Number(els.planSpending.value) || 0;
  const budget = Number(els.planBudget.value) || 0;

  if (!title || !date || spending < 0 || budget < 0) {
    showPlanStatus("Add a date and plan title");
    return;
  }

  state.plans.push({
    id: randomId(),
    date,
    title,
    spending,
    budget,
    notes: els.planNotes.value.trim()
  });

  selectedPlanDate = date;
  planningDate = firstOfMonth(fromISO(date));
  els.planTitle.value = "";
  els.planSpending.value = "";
  els.planBudget.value = "";
  els.planNotes.value = "";
  saveState();
  renderPlanning();
  showPlanStatus("Plan saved");
}

function showPlanStatus(message) {
  window.clearTimeout(planStatusTimer);
  els.planStatus.textContent = message;
  planStatusTimer = window.setTimeout(() => {
    els.planStatus.textContent = "";
  }, 2200);
}

function selectPlanDate(date) {
  selectedPlanDate = date;
  els.planDate.value = date;
  renderPlanning();
  els.planTitle.focus();
}

function confirmDelete(button, key, id) {
  const token = `${key}:${id}`;
  if (pendingDelete === token) {
    pendingDelete = null;
    removeItem(key, id);
    return;
  }

  document.querySelectorAll(".delete.confirming").forEach((item) => {
    item.textContent = "x";
    item.classList.remove("confirming");
  });

  pendingDelete = token;
  button.textContent = "Confirm";
  button.classList.add("confirming");

  window.setTimeout(() => {
    if (pendingDelete !== token) return;
    pendingDelete = null;
    if (!button.isConnected) return;
    button.textContent = "x";
    button.classList.remove("confirming");
  }, CONFIRM_RESET_MS);
}

function removeItem(key, id) {
  const folder = activeFolder();

  if (key === "folders") {
    state.folders = state.folders.filter((item) => item.id !== id);
    if (!state.folders.length) {
      const fallback = createWorkspaceFolder({ name: "Main salary", note: "Fresh salary workspace." });
      state.folders.push(fallback);
    }
    if (state.activeFolderId === id) {
      state.activeFolderId = state.folders[0].id;
    }
  } else if (key === "plans") {
    state.plans = state.plans.filter((item) => item.id !== id);
  } else {
    folder[key] = folder[key].filter((item) => item.id !== id);
  }

  saveState();
  render();
}

function moneyTotals(folder = activeFolder()) {
  const entries = includedEntries(folder);
  const expensesList = periodExpenses(folder);
  const { start, end } = currentPeriod();
  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const salary = entries.reduce((sum, entry) => sum + entryPay(entry), 0);
  const expenses = expensesList.reduce((sum, item) => sum + item.amount, 0);
  const budgets = folder.budgets.reduce((sum, item) => sum + item.amount, 0);
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

function folderTotals(folder) {
  const hours = folder.entries.reduce((sum, entry) => sum + entry.hours, 0);
  const salary = folder.entries.reduce((sum, entry) => sum + entry.hours * rateForDate(entry.date, folder), 0);
  const expenses = folder.expenses.reduce((sum, item) => sum + item.amount, 0);
  return { hours, salary, expenses };
}

function monthEarnings(folder = activeFolder()) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return folder.entries
    .filter((entry) => {
      const date = fromISO(entry.date);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .reduce((sum, entry) => sum + entryPay(entry, folder), 0);
}

function entryPay(entry, folder = activeFolder()) {
  return entry.hours * rateForDate(entry.date, folder);
}

function rateForDate(isoDate, folder = activeFolder()) {
  return folder.settings.hourlyRate + (isWeekend(isoDate) ? folder.settings.weekendBonus : 0);
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

function plansGroupedByDate() {
  return state.plans.reduce((map, plan) => {
    if (!map.has(plan.date)) map.set(plan.date, []);
    map.get(plan.date).push(plan);
    return map;
  }, new Map());
}

function planMoneyPreview(plans) {
  const spending = plans.reduce((sum, plan) => sum + plan.spending, 0);
  const budget = plans.reduce((sum, plan) => sum + plan.budget, 0);
  if (spending || budget) return `${money(spending)} expected / ${money(budget)} budget`;
  return `${plans.length} ${plans.length === 1 ? "plan" : "plans"}`;
}

function money(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: activeFolder().settings.currency,
    maximumFractionDigits: activeFolder().settings.currency === "JPY" ? 0 : 2
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
