const STORAGE_KEY = "bishop-goal-tracker-state-v1";
const backendRuntime = window.BishopGoalTrackerBackend || {
  runtimeMode: "demo-local",
  statusMessage: "Running in demo local mode with browser storage."
};
const backendClient = window.BishopGoalTrackerClient || {
  async loadAppState(storageKey, fallbackState) {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(fallbackState));
  },
  async saveAppState(storageKey, nextState) {
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
    return true;
  }
};
const authClient = window.BishopGoalTrackerAuthClient || {
  async hydrateSession(appState) {
    return { session: appState.session || null, appState };
  },
  async signIn({ appState, role, email, password }) {
    const matchedUser = appState.users.find((user) =>
      user.role === role &&
      String(user.email || "").toLowerCase() === email &&
      user.password === password
    );
    if (!matchedUser) {
      return { ok: false, error: "Login not recognized. Please use one of the demo accounts or create a new account." };
    }
    return { ok: true, session: { userId: matchedUser.id, authMode: "demo-local" } };
  },
  async signUp({ appState, role, name, email, ward, organization, password, createId }) {
    const newUser = {
      id: createId(role === "bishop" ? "bishop" : role === "youth_leader" ? "leader" : "youth"),
      role,
      name,
      email,
      password,
      ward,
      organization,
      approvalStatus: role === "youth_leader" ? "pending" : "verified"
    };
    return { ok: true, appState: { ...appState, users: [...appState.users, newUser] }, session: { userId: newUser.id, authMode: "demo-local" } };
  },
  async signOut() {
    return { ok: true };
  }
};
const storageAdapter = window.BishopGoalTrackerStorage || {
  name: "browser-localStorage-fallback",
  mode: "demo-local",
  statusMessage: "Running in demo local mode with browser storage.",
  getItem(key) {
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
  }
};
const isSupabaseRuntime = backendRuntime.runtimeMode === "supabase";
const BOOTSTRAP_TIMEOUT_MS = 8000;
const LEVEL_POINT_REQUIREMENTS = [100, 100, 100];
const AWARD_NAMES_BY_ORGANIZATION = {
  young_men: [
    "Iron Rod Award",
    "Stripling Warrior Award",
    "Helaman Leadership Award"
  ],
  young_women: [
    "Builders of Faith Award",
    "Messengers of Hope Award",
    "Gatherers of Light Award"
  ]
};

const firstRunState = {
  users: [
    { id: "u1", role: "youth", email: "josh@example.com", password: "goal123", name: "Josh Carter", ward: "Mapleton 1st Ward", organization: "young_men" },
    { id: "u2", role: "youth", email: "maria@example.com", password: "growth456", name: "Maria Lopez", ward: "Mapleton 1st Ward", organization: "young_women" },
    { id: "l1", role: "youth_leader", email: "leader.one@example.com", password: "approve789", name: "Brother Jensen", ward: "Mapleton 1st Ward", organization: "young_men", approvalStatus: "approved" },
    { id: "l2", role: "youth_leader", email: "leader.two@example.com", password: "hearts456", name: "Sister Lopez", ward: "Mapleton 1st Ward", organization: "young_women", approvalStatus: "approved" },
    { id: "b1", role: "bishop", email: "ward.bishop@example.com", password: "steward123", name: "Bishop Reynolds", ward: "Mapleton 1st Ward", approvalStatus: "verified" }
  ],
  goals: [
    {
      id: "g1",
      userId: "u1",
      title: "Complete Service Project Plan",
      summary: "Organize and finish a monthly quorum service project with full participation.",
      points: 40,
      deadline: "2026-12-31",
      leaderApproved: false,
      leaderApprovedBy: null,
      completedAt: null,
      subGoals: [
        { id: "sg1", title: "Choose project location", completed: true },
        { id: "sg2", title: "Build volunteer sign-up list", completed: true },
        { id: "sg3", title: "Finish project day", completed: false }
      ]
    },
    {
      id: "g2",
      userId: "u1",
      title: "Prepare Teaching Assignment",
      summary: "Study, prepare, and deliver the next quorum lesson.",
      points: 60,
      deadline: "2026-12-31",
      leaderApproved: false,
      leaderApprovedBy: null,
      completedAt: null,
      subGoals: [
        { id: "sg4", title: "Read source materials", completed: true },
        { id: "sg5", title: "Write outline", completed: true },
        { id: "sg6", title: "Deliver lesson", completed: true }
      ]
    },
    {
      id: "g3",
      userId: "u2",
      title: "Temple Family History Goal",
      summary: "Research family names and prepare one family line for temple submission.",
      points: 100,
      deadline: "2026-12-31",
      leaderApproved: true,
      leaderApprovedBy: "Bishop Reynolds",
      completedAt: "2026-04-01",
      subGoals: [
        { id: "sg7", title: "Collect family records", completed: true },
        { id: "sg8", title: "Verify dates and places", completed: true },
        { id: "sg9", title: "Submit final names", completed: true }
      ]
    }
  ],
  templates: [
    {
      id: "t1",
      title: "Daily Scripture Habit",
      summary: "Build a steady scripture study routine over three months.",
      points: 100,
      subGoals: [
        { id: "tsg1", title: "Read 20 minutes a day", repeatCount: 90 },
        { id: "tsg2", title: "Write one takeaway each week", repeatCount: 12 }
      ]
    }
  ],
  session: null
};

const elements = {
  userTab: document.getElementById("userTab"),
  leaderTab: document.getElementById("leaderTab"),
  bishopTab: document.getElementById("bishopTab"),
  signInModeButton: document.getElementById("signInModeButton"),
  createAccountModeButton: document.getElementById("createAccountModeButton"),
  userAuthModes: document.getElementById("userAuthModes"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  registerOrganizationField: document.getElementById("registerOrganizationField"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  identityLabel: document.getElementById("identityLabel"),
  loginView: document.getElementById("loginView"),
  sessionView: document.getElementById("sessionView"),
  sessionBadge: document.getElementById("sessionBadge"),
  sessionTitle: document.getElementById("sessionTitle"),
  sessionDescription: document.getElementById("sessionDescription"),
  sessionProgressTracker: document.getElementById("sessionProgressTracker"),
  logoutButton: document.getElementById("logoutButton"),
  demoAccountsBox: document.getElementById("demoAccountsBox"),
  dashboardTitle: document.getElementById("dashboardTitle"),
  emptyState: document.getElementById("emptyState"),
  runtimeBanner: document.getElementById("runtimeBanner"),
  userDashboard: document.getElementById("userDashboard"),
  leaderDashboard: document.getElementById("leaderDashboard"),
  goalCardTemplate: document.getElementById("goalCardTemplate")
};

let activeRole = "youth";
let activeUserAuthMode = "signin";
let activeTemplateId = null;
let activeYouthDashboardView = "goals";
let activeGoalEditorId = null;
let state = normalizeState(getFallbackState());
let bootstrappedState = false;

function cloneFirstRunState() {
  return JSON.parse(JSON.stringify(firstRunState));
}

function createEmptyState() {
  return {
    users: [],
    goals: [],
    templates: [],
    session: null
  };
}

function getFallbackState() {
  return isSupabaseRuntime ? createEmptyState() : cloneFirstRunState();
}

function cloneStateSnapshot() {
  return JSON.parse(JSON.stringify(state));
}

function renderRuntimeBanner() {
  if (elements.demoAccountsBox) {
    elements.demoAccountsBox.classList.toggle("hidden", isSupabaseRuntime);
  }

  if (!elements.runtimeBanner) {
    return;
  }

  const modeLabel = backendRuntime.runtimeMode === "supabase" ? "Supabase Mode" : "Demo Local Mode";
  elements.runtimeBanner.innerHTML = `<strong>${modeLabel}</strong><span>${storageAdapter.statusMessage || backendRuntime.statusMessage}</span>`;
}

async function persistGoal(goal, options = {}) {
  const nextState = options.isCreate
    ? await backendClient.createGoal(STORAGE_KEY, state, {
      goal,
      createdBy: options.createdBy || state.session?.userId || goal.userId,
      sourceTemplateId: options.sourceTemplateId || null,
      sourceGoalId: options.sourceGoalId || null,
      fallbackState: getFallbackState()
    })
    : await backendClient.updateGoal(STORAGE_KEY, state, {
      goal,
      fallbackState: getFallbackState()
    });
  state = normalizeState(nextState);
  saveState();
  render();
}

async function persistTemplate(template, options = {}) {
  const nextState = options.isCreate
    ? await backendClient.createTemplate(STORAGE_KEY, state, {
      template,
      createdBy: options.createdBy || state.session?.userId,
      fallbackState: getFallbackState()
    })
    : await backendClient.updateTemplate(STORAGE_KEY, state, {
      template,
      fallbackState: getFallbackState()
    });
  state = normalizeState(nextState);
  saveState();
  render();
}

function normalizeState(rawState) {
  const nextState = JSON.parse(JSON.stringify(rawState));

  nextState.users = nextState.users.map((user) => ({
    ...user,
    role: user.role === "user" ? "youth" : user.role === "leader" ? "youth_leader" : user.role,
    email: String(user.email || user.username || "").toLowerCase(),
    ward: String(user.ward || "").trim(),
    organization: user.role === "bishop" ? "all" : (user.organization || (user.role === "youth" ? "young_men" : "young_men")),
    approvalStatus: user.approvalStatus || (user.role === "youth_leader" ? "approved" : "verified")
  }));

  nextState.goals = nextState.goals.map((goal) => {
    const points = normalizePointValue(goal.points);
    const completionApproved = Boolean(goal.leaderApproved);
    const planApproved = typeof goal.goalApproved === "boolean"
      ? goal.goalApproved
      : points > 0 || completionApproved;

    return {
      ...goal,
      points,
      goalApproved: planApproved,
      goalApprovedBy: goal.goalApprovedBy || (planApproved ? goal.leaderApprovedBy || "Leader" : null),
      goalApprovedAt: goal.goalApprovedAt || (planApproved ? goal.completedAt || null : null),
      leaderApproved: completionApproved,
      leaderApprovedBy: goal.leaderApprovedBy || null,
      completedAt: goal.completedAt || null,
      deadline: normalizeGoalDeadline(goal),
      subGoals: goal.subGoals.map((subGoal) => ({
        id: subGoal.id,
        title: subGoal.title,
        repeatCount: Math.max(1, Number(subGoal.repeatCount || 1)),
        completedUnits: normalizeCompletedUnits(subGoal)
      }))
    };
  });

  nextState.goals.forEach((goal) => {
    goal.subGoals = goal.subGoals.map((subGoal) => ({
      ...subGoal,
      completedUnits: subGoal.completedUnits.slice(0, subGoal.repeatCount)
    }));
  });

  nextState.templates = (nextState.templates || []).map((template) => ({
    ...template,
    points: normalizePointValue(template.points),
    subGoals: (template.subGoals || []).map((subGoal) => ({
      id: subGoal.id,
      title: subGoal.title,
      repeatCount: parseRepeatCount(subGoal.repeatCount || 1)
    }))
  }));

  return nextState;
}

async function loadState() {
  try {
    const loadedState = await backendClient.loadAppState(STORAGE_KEY, getFallbackState());
    return normalizeState(loadedState);
  } catch (error) {
    console.warn("Backend client load failed; using local fallback state.", error);
    const saved = storageAdapter.getItem(STORAGE_KEY);
    if (!saved) {
      const initialState = normalizeState(getFallbackState());
      storageAdapter.setItem(STORAGE_KEY, JSON.stringify(initialState));
      return initialState;
    }

    try {
      return normalizeState(JSON.parse(saved));
    } catch (fallbackError) {
      const initialState = normalizeState(getFallbackState());
      storageAdapter.setItem(STORAGE_KEY, JSON.stringify(initialState));
      return initialState;
    }
  }
}

function loadCachedState() {
  const saved = storageAdapter.getItem(STORAGE_KEY);
  if (!saved) {
    return normalizeState(getFallbackState());
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    return normalizeState(getFallbackState());
  }
}

function createTimeoutPromise(label, milliseconds) {
  return new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${milliseconds}ms.`));
    }, milliseconds);
  });
}

function saveState() {
  storageAdapter.setItem(STORAGE_KEY, JSON.stringify(state));
  backendClient.saveAppState(STORAGE_KEY, state).catch((error) => {
    console.warn("Backend client save failed; local fallback remains available.", error);
  });
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePointValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function addDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function getDefaultGoalDeadline() {
  return addDays(getTodayDateString(), 30);
}

function normalizeGoalDeadline(goal) {
  return goal.deadline ? String(goal.deadline).slice(0, 10) : getDefaultGoalDeadline();
}

function formatDeadline(value) {
  return formatCompletedDate(value);
}

function isGoalOverdue(goal) {
  return Boolean(goal.deadline && getTodayDateString() > goal.deadline && !goal.leaderApproved);
}

function isGoalClosed(goal) {
  return isGoalOverdue(goal);
}

function normalizeCompletedUnits(subGoal) {
  const repeatCount = Math.max(1, Number(subGoal.repeatCount || 1));
  const existingUnits = Array.isArray(subGoal.completedUnits)
    ? subGoal.completedUnits.slice(0, repeatCount).map((value) => (value ? String(value).slice(0, 10) : null))
    : [];
  const fallbackCompletedCount = typeof subGoal.completedCount === "number"
    ? Math.max(0, Number(subGoal.completedCount))
    : (typeof subGoal.completed === "boolean"
      ? (subGoal.completed ? repeatCount : 0)
      : (Number(subGoal.progress || 0) >= 100 ? repeatCount : 0));
  const normalizedUnits = [...existingUnits];

  for (let index = 0; index < repeatCount; index += 1) {
    if (typeof normalizedUnits[index] === "undefined") {
      normalizedUnits[index] = index < fallbackCompletedCount ? getTodayDateString() : null;
    }
  }

  return normalizedUnits.slice(0, repeatCount);
}

function getCompletedCount(subGoal) {
  return (subGoal.completedUnits || []).filter(Boolean).length;
}

function formatCompletedDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getMostRecentCompletedUnitIndex(subGoal) {
  const units = subGoal.completedUnits || [];
  let latestIndex = -1;
  let latestValue = "";

  units.forEach((value, index) => {
    if (value && value >= latestValue) {
      latestValue = value;
      latestIndex = index;
    }
  });

  return latestIndex;
}

function parseRepeatCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(count));
}

function parseChecklistLine(line) {
  const match = line.match(/^(.*?)(?:\s*\|\s*(\d+))?$/);
  const title = match ? match[1].trim() : line.trim();
  const repeatCount = match && match[2] ? parseRepeatCount(match[2]) : 1;

  return {
    title,
    repeatCount
  };
}

function readDraftChecklistItems(form) {
  try {
    return JSON.parse(form.elements.goalSubGoalsData.value || "[]");
  } catch (error) {
    return [];
  }
}

function writeDraftChecklistItems(form, items) {
  form.elements.goalSubGoalsData.value = JSON.stringify(items);
}

function syncGoalFormFromTemplate(form, templateId) {
  if (!form) {
    return;
  }

  if (!templateId) {
    form.elements.goalTitle.value = "";
    form.elements.goalSummary.value = "";
    if (form.elements.goalPoints) {
      form.elements.goalPoints.value = "0";
    }
    writeDraftChecklistItems(form, []);
    renderDraftChecklistItems(form);
    return;
  }

  const template = state.templates.find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  form.elements.goalTitle.value = template.title;
  form.elements.goalSummary.value = template.summary;
  if (form.elements.goalPoints) {
    form.elements.goalPoints.value = String(normalizePointValue(template.points));
  }
  writeDraftChecklistItems(form, template.subGoals.map((subGoal) => ({
    title: subGoal.title,
    repeatCount: subGoal.repeatCount
  })));
  renderDraftChecklistItems(form);
}

function renderDraftChecklistItems(form) {
  const items = readDraftChecklistItems(form);
  const list = form.querySelector(".draft-checklist-list");
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "subgoal-meta";
    empty.textContent = "No checklist items added yet.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "draft-item-row";

    const text = document.createElement("div");
    text.innerHTML = `<strong>${item.title}</strong><br><span class="subgoal-meta">${item.repeatCount} checkbox${item.repeatCount === 1 ? "" : "es"}</span>`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      const nextItems = readDraftChecklistItems(form).filter((_, itemIndex) => itemIndex !== index);
      writeDraftChecklistItems(form, nextItems);
      renderDraftChecklistItems(form);
    });

    row.append(text, removeButton);
    list.appendChild(row);
  });
}

function addDraftChecklistItem(form) {
  const title = form.elements.newSubGoalTitle.value.trim();
  const repeatCount = parseRepeatCount(form.elements.newSubGoalRepeatCount.value);

  if (!title) {
    window.alert("Please enter a checklist item description before adding it.");
    return;
  }

  const items = readDraftChecklistItems(form);
  items.push({ title, repeatCount });
  writeDraftChecklistItems(form, items);
  form.elements.newSubGoalTitle.value = "";
  form.elements.newSubGoalRepeatCount.value = "1";
  renderDraftChecklistItems(form);
}

function buildGoalFromTemplate(template, userId, deadline = getDefaultGoalDeadline()) {
  const sessionUser = getSessionUser();
  return {
    id: createId("goal"),
    userId,
    title: template.title,
    summary: template.summary,
    points: normalizePointValue(template.points),
    goalApproved: Boolean(sessionUser && isWardAdmin(sessionUser)),
    goalApprovedBy: sessionUser && isWardAdmin(sessionUser) ? sessionUser.name : null,
    goalApprovedAt: sessionUser && isWardAdmin(sessionUser) ? getTodayDateString() : null,
    deadline,
    leaderApproved: false,
    leaderApprovedBy: null,
    completedAt: null,
    subGoals: template.subGoals.map((subGoal) => ({
      id: createId("subgoal"),
      title: subGoal.title,
      repeatCount: subGoal.repeatCount,
      completedUnits: Array.from({ length: subGoal.repeatCount }, () => null)
    }))
  };
}

function cloneGoalForUser(sourceGoal, userId, deadline = (sourceGoal.deadline && sourceGoal.deadline > getTodayDateString()) ? sourceGoal.deadline : getDefaultGoalDeadline()) {
  const sessionUser = getSessionUser();
  return {
    id: createId("goal"),
    userId,
    title: sourceGoal.title,
    summary: sourceGoal.summary,
    points: normalizePointValue(sourceGoal.points),
    goalApproved: Boolean(sessionUser && isWardAdmin(sessionUser)),
    goalApprovedBy: sessionUser && isWardAdmin(sessionUser) ? sessionUser.name : null,
    goalApprovedAt: sessionUser && isWardAdmin(sessionUser) ? getTodayDateString() : null,
    deadline,
    leaderApproved: false,
    leaderApprovedBy: null,
    completedAt: null,
    subGoals: sourceGoal.subGoals.map((subGoal) => ({
      id: createId("subgoal"),
      title: subGoal.title,
      repeatCount: subGoal.repeatCount,
      completedUnits: Array.from({ length: subGoal.repeatCount }, () => null)
    }))
  };
}

async function saveGoalAsTemplate(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    return;
  }

  const template = {
    id: createId("template"),
    title: goal.title,
    summary: goal.summary,
    points: normalizePointValue(goal.points),
    subGoals: goal.subGoals.map((subGoal) => ({
      id: createId("template-subgoal"),
      title: subGoal.title,
      repeatCount: subGoal.repeatCount
    }))
  };

  await persistTemplate(template, { isCreate: true });
  activeTemplateId = template.id;
  render();
}

async function approveGoalExtension(goalId, newDeadline) {
  const goal = state.goals.find((item) => item.id === goalId);
  const sessionUser = getSessionUser();
  if (!goal || !sessionUser || !isWardAdmin(sessionUser)) {
    return;
  }

  if (!newDeadline) {
    window.alert("Please choose a new deadline before approving the extension.");
    return;
  }

  if (newDeadline <= getTodayDateString()) {
    window.alert("Please choose an extension date after today.");
    return;
  }

  goal.deadline = newDeadline;
  resetCompletionApproval(goal);
  await persistGoal(goal);
}

async function updateGoalDetails(goalId, form) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    return;
  }

  const title = form.elements.editGoalTitle.value.trim();
  const summary = form.elements.editGoalSummary.value.trim();
  const points = normalizePointValue(form.elements.editGoalPoints.value);
  const deadline = form.elements.editGoalDeadline.value;
  if (!title || !summary || !deadline) {
    window.alert("Please provide a goal title, summary, and deadline.");
    return;
  }

  const subGoals = Array.from(form.querySelectorAll(".editable-subgoal-row")).map((row, index) => ({
    id: goal.subGoals[index]?.id || createId("subgoal"),
    title: row.querySelector("[name='editableSubGoalTitle']").value.trim(),
    repeatCount: parseRepeatCount(row.querySelector("[name='editableSubGoalRepeatCount']").value),
    completedUnits: (goal.subGoals[index]?.completedUnits || [])
      .slice(0, parseRepeatCount(row.querySelector("[name='editableSubGoalRepeatCount']").value))
  })).filter((item) => item.title);

  if (!subGoals.length) {
    window.alert("Please keep at least one checklist item on the goal.");
    return;
  }

  goal.title = title;
  goal.summary = summary;
  goal.points = points;
  goal.deadline = deadline;
  goal.subGoals = subGoals;
  approveGoalPlanFields(goal, getSessionUser(), points);
  if (getGoalProgress(goal) < 100) {
    resetCompletionApproval(goal);
  }
  await persistGoal(goal);
}

async function updateTemplateDetails(templateId, form) {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) {
    return;
  }

  const title = form.elements.editTemplateTitle.value.trim();
  const summary = form.elements.editTemplateSummary.value.trim();
  const points = normalizePointValue(form.elements.editTemplatePoints.value);
  const subGoals = Array.from(form.querySelectorAll(".editable-subgoal-row")).map((row, index) => ({
    id: template.subGoals[index]?.id || createId("template-subgoal"),
    title: row.querySelector("[name='editableSubGoalTitle']").value.trim(),
    repeatCount: parseRepeatCount(row.querySelector("[name='editableSubGoalRepeatCount']").value)
  })).filter((item) => item.title);

  if (!title || !summary || !subGoals.length) {
    window.alert("Templates need a title, summary, and at least one checklist item.");
    return;
  }

  template.title = title;
  template.summary = summary;
  template.points = points;
  template.subGoals = subGoals;
  activeTemplateId = null;
  await persistTemplate(template);
}

async function copyGoalToYouth(goalId, userId) {
  const sessionUser = getSessionUser();
  const goal = state.goals.find((item) => item.id === goalId);
  const youth = state.users.find((item) => item.id === userId);
  if (!sessionUser || !goal || !youth || !canManageYouth(sessionUser, youth)) {
    window.alert("Please choose a youth you can manage before copying the goal.");
    return;
  }

  await persistGoal(cloneGoalForUser(goal, youth.id), {
    isCreate: true,
    createdBy: sessionUser.id,
    sourceGoalId: goal.id
  });
}

function buildEditableSubgoalRows(items) {
  return items.map((item) => `
    <div class="editable-subgoal-row">
      <label>
        <span>Checklist item</span>
        <input name="editableSubGoalTitle" type="text" value="${item.title.replace(/"/g, "&quot;")}">
      </label>
      <label>
        <span>Quantity</span>
        <input name="editableSubGoalRepeatCount" type="number" min="1" step="1" value="${item.repeatCount}">
      </label>
    </div>
  `).join("");
}

function getGoalProgress(goal) {
  if (!goal.subGoals.length) {
    return 0;
  }

  const totalChecks = goal.subGoals.reduce((sum, subGoal) => sum + subGoal.repeatCount, 0);
  const completedChecks = goal.subGoals.reduce((sum, subGoal) => sum + getCompletedCount(subGoal), 0);
  return totalChecks ? Math.round((completedChecks / totalChecks) * 100) : 0;
}

function getEarnedGoalPoints(goal) {
  return goal.goalApproved && goal.leaderApproved ? normalizePointValue(goal.points) : 0;
}

function getYouthEarnedPoints(userId) {
  return state.goals
    .filter((goal) => goal.userId === userId)
    .reduce((sum, goal) => sum + getEarnedGoalPoints(goal), 0);
}

function getLevelPointMilestones() {
  let runningTotal = 0;
  return LEVEL_POINT_REQUIREMENTS.map((points, index) => {
    runningTotal += points;
    return {
      index: index + 1,
      points,
      threshold: runningTotal
    };
  });
}

function getAwardNamesForYouth(sessionUser) {
  return AWARD_NAMES_BY_ORGANIZATION[sessionUser?.organization] || AWARD_NAMES_BY_ORGANIZATION.young_men;
}

function renderSessionProgressTracker(sessionUser) {
  if (!elements.sessionProgressTracker) {
    return;
  }

  if (!sessionUser || sessionUser.role !== "youth") {
    elements.sessionProgressTracker.classList.add("hidden");
    elements.sessionProgressTracker.innerHTML = "";
    return;
  }

  const earnedPoints = getYouthEarnedPoints(sessionUser.id);
  const milestones = getLevelPointMilestones();
  const awardNames = getAwardNamesForYouth(sessionUser);
  const currentLevel = milestones.find((level) => earnedPoints < level.threshold) || milestones[milestones.length - 1];

  elements.sessionProgressTracker.classList.remove("hidden");
  elements.sessionProgressTracker.innerHTML = `
    <section class="sidebar-progress-card">
      <div>
        <p class="eyebrow">Overall Progress</p>
        <div class="sidebar-progress-total">
          <strong>${earnedPoints} pts</strong>
          <span class="subgoal-meta">Current target: ${awardNames[currentLevel.index - 1]}</span>
        </div>
      </div>
      <div class="sidebar-progress-levels">
        ${milestones.map((level) => {
          const pointsIntoLevel = Math.max(0, earnedPoints - (level.threshold - level.points));
          const percent = Math.max(0, Math.min(100, Math.round((pointsIntoLevel / level.points) * 100)));
          const complete = earnedPoints >= level.threshold;
          return `
            <div class="sidebar-progress-level${complete ? " is-complete" : ""}">
              <div class="sidebar-progress-level-head">
                <strong>${awardNames[level.index - 1]}</strong>
                <span class="subgoal-meta">${Math.min(pointsIntoLevel, level.points)}/${level.points} pts</span>
              </div>
              <div class="sidebar-progress-bar">
                <div class="sidebar-progress-fill" style="width:${percent}%"></div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <p class="subgoal-meta">Points are awarded after a Youth leader or bishop approves both the goal plan and the completed goal.</p>
    </section>
  `;
}

function approveGoalPlanFields(goal, sessionUser, points = goal.points) {
  goal.points = normalizePointValue(points);
  goal.goalApproved = true;
  goal.goalApprovedBy = sessionUser.name;
  goal.goalApprovedAt = getTodayDateString();
}

function resetGoalPlanApproval(goal) {
  goal.goalApproved = false;
  goal.goalApprovedBy = null;
  goal.goalApprovedAt = null;
}

function resetCompletionApproval(goal) {
  goal.leaderApproved = false;
  goal.leaderApprovedBy = null;
  goal.completedAt = null;
}

function openGoalEditor(goalId) {
  activeGoalEditorId = goalId;
  render();
}

function closeGoalEditor() {
  activeGoalEditorId = null;
  render();
}

function getGoalStatus(goal) {
  const progress = getGoalProgress(goal);

  if (!goal.goalApproved) {
    return { label: "Pending goal approval", className: "pending" };
  }

  if (goal.leaderApproved) {
    return { label: "Completed and approved", className: "approved" };
  }

  if (isGoalOverdue(goal)) {
    return { label: "Deadline passed", className: "overdue" };
  }

  if (progress === 100) {
    return { label: "Pending completion approval", className: "pending" };
  }

  return { label: "In progress", className: "in-progress" };
}

function getSessionUser() {
  if (!state.session) {
    return null;
  }

  return state.users.find((user) => user.id === state.session.userId) || null;
}

function getOrganizationLabel(value) {
  return value === "young_women" ? "Young Women" : value === "young_men" ? "Young Men" : "All Youth";
}

function canManageYouth(manager, youth) {
  if (!manager || !youth || youth.role !== "youth") {
    return false;
  }

  if (manager.role === "bishop") {
    return manager.ward === youth.ward;
  }

  if (manager.role === "youth_leader") {
    return manager.ward === youth.ward && manager.organization === youth.organization;
  }

  return false;
}

function getManagedYouth(manager) {
  return state.users.filter((user) => canManageYouth(manager, user));
}

function isWardAdmin(user) {
  return Boolean(user && (user.role === "bishop" || user.role === "youth_leader"));
}

function getAllowedOrganizationsForManager(manager) {
  if (!manager) {
    return [];
  }

  if (manager.role === "bishop") {
    return ["young_men", "young_women"];
  }

  if (manager.role === "youth_leader") {
    return [manager.organization];
  }

  return [];
}

function getWardBishop(ward) {
  return state.users.find((user) => user.role === "bishop" && user.ward === ward) || null;
}

function getPendingWardLeaders(ward) {
  return state.users.filter((user) => user.role === "youth_leader" && user.ward === ward && user.approvalStatus !== "approved");
}

function getActiveTemplate() {
  if (!state.templates.length) {
    activeTemplateId = null;
    return null;
  }

  const matchingTemplate = state.templates.find((template) => template.id === activeTemplateId);
  if (matchingTemplate) {
    return matchingTemplate;
  }

  activeTemplateId = state.templates[0].id;
  return state.templates[0];
}

function setUserAuthMode(mode) {
  activeUserAuthMode = mode;
  const createMode = mode === "create";
  elements.signInModeButton.classList.toggle("active", mode === "signin");
  elements.createAccountModeButton.classList.toggle("active", mode === "create");
  elements.loginForm.classList.toggle("hidden", createMode);
  elements.registerForm.classList.toggle("hidden", !createMode);
}

function setActiveRole(role) {
  activeRole = role;
  elements.userTab.classList.toggle("active", role === "youth");
  elements.leaderTab.classList.toggle("active", role === "youth_leader");
  elements.bishopTab.classList.toggle("active", role === "bishop");
  elements.userAuthModes.classList.remove("hidden");
  elements.identityLabel.textContent = "Email";
  elements.username.type = "email";
  elements.username.placeholder =
    role === "bishop" ? "Enter bishop email" :
    role === "youth_leader" ? "Enter Youth leader email" :
    "Enter youth email";
  elements.registerOrganizationField.classList.toggle("hidden", role === "bishop");
  setUserAuthMode(activeUserAuthMode);
}

async function login(event) {
  event.preventDefault();
  try {
    const identifier = elements.username.value.trim().toLowerCase();
    const password = elements.password.value;
    const result = await authClient.signIn({
      appState: state,
      role: activeRole,
      email: identifier,
      password
    });

    if (!result.ok) {
      window.alert(result.error);
      return;
    }

    if (result.appState) {
      state = normalizeState(result.appState);
    }
    state.session = result.session;
    saveState();
    elements.loginForm.reset();
    render();
  } catch (error) {
    console.warn("Login failed unexpectedly.", error);
    window.alert(error?.message || "Login failed unexpectedly. Please try again.");
  }
}

async function registerUser(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const name = form.elements.registerName.value.trim();
  const email = form.elements.registerEmail.value.trim().toLowerCase();
  const ward = form.elements.registerWard.value.trim();
  const organization = activeRole === "bishop" ? "all" : form.elements.registerOrganization.value;
  const password = form.elements.registerPassword.value;

  if (!name || !email || !ward || !password) {
    window.alert("Please complete your name, email, ward, and password.");
    return;
  }

  const result = await authClient.signUp({
    appState: state,
    role: activeRole,
    name,
    email,
    ward,
    organization,
    password,
    createId
  });

  if (!result.ok) {
    window.alert(result.error);
    return;
  }

  state = normalizeState(result.appState || state);
  if (result.requiresEmailVerification) {
    saveState();
    form.reset();
    setUserAuthMode("signin");
    window.alert("Your account was created. Please verify your email, then sign in to finish setting up your profile.");
    render();
    return;
  }
  if (result.pendingApproval) {
    saveState();
    form.reset();
    setUserAuthMode("signin");
    window.alert("Your Youth leader account has been created and is waiting for bishop approval.");
    render();
    return;
  }

  state.session = result.session;
  saveState();
  form.reset();
  setUserAuthMode("signin");
  render();
}

async function logout() {
  await authClient.signOut();
  state.session = null;
  saveState();
  render();
}

async function toggleSubGoalUnit(goalId, subGoalId, unitIndex, completed) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal || isGoalClosed(goal) || !goal.goalApproved) {
    return;
  }

  const subGoal = goal.subGoals.find((item) => item.id === subGoalId);
  if (!subGoal) {
    return;
  }

  subGoal.completedUnits = subGoal.completedUnits || Array.from({ length: subGoal.repeatCount }, () => null);
  subGoal.completedUnits[unitIndex] = completed ? getTodayDateString() : null;

  if (getGoalProgress(goal) < 100) {
    resetCompletionApproval(goal);
  }

  await persistGoal(goal);
}

async function undoLatestSubGoalCompletion(goalId, subGoalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) {
    return;
  }

  const subGoal = goal.subGoals.find((item) => item.id === subGoalId);
  if (!subGoal) {
    return;
  }

  const latestIndex = getMostRecentCompletedUnitIndex(subGoal);
  if (latestIndex < 0) {
    return;
  }

  subGoal.completedUnits[latestIndex] = null;
  resetCompletionApproval(goal);
  await persistGoal(goal);
}

async function approveGoalPlan(goalId, points) {
  const sessionUser = getSessionUser();
  const goal = state.goals.find((item) => item.id === goalId);

  if (!sessionUser || !isWardAdmin(sessionUser) || !goal) {
    return;
  }

  if (isGoalClosed(goal)) {
    window.alert("This goal needs an approved extension before it can be approved.");
    return;
  }

  approveGoalPlanFields(goal, sessionUser, points);
  await persistGoal(goal);
}

async function approveGoal(goalId) {
  const sessionUser = getSessionUser();
  const goal = state.goals.find((item) => item.id === goalId);

  if (!sessionUser || !isWardAdmin(sessionUser) || !goal) {
    return;
  }

  if (isGoalClosed(goal)) {
    window.alert("This goal needs an approved extension before it can be signed off.");
    return;
  }

  if (!goal.goalApproved) {
    window.alert("Approve the goal plan and assign points before completing final approval.");
    return;
  }

  if (getGoalProgress(goal) !== 100) {
    window.alert("Every checklist item must be complete before a leader can approve the goal.");
    return;
  }

  goal.leaderApproved = true;
  goal.leaderApprovedBy = sessionUser.name;
  goal.completedAt = getTodayDateString();
  await persistGoal(goal);
}

function resetFirstRunState() {
  if (isSupabaseRuntime) {
    return;
  }
  state = normalizeState(cloneFirstRunState());
  saveState();
  render();
}

async function addGoal(event) {
  event.preventDefault();

  const sessionUser = getSessionUser();
  if (!sessionUser || sessionUser.role !== "youth") {
    return;
  }

  const form = event.currentTarget;
  const title = form.elements.goalTitle.value.trim();
  const summary = form.elements.goalSummary.value.trim();
  const deadline = form.elements.goalDeadline.value;
  const draftChecklistItems = readDraftChecklistItems(form);

  if (!title || !summary || !deadline || !draftChecklistItems.length) {
    window.alert("Please add a goal title, summary, deadline, and at least one checklist item.");
    return;
  }

  const goal = {
    id: createId("goal"),
    userId: sessionUser.id,
    title,
    summary,
    points: 0,
    goalApproved: false,
    goalApprovedBy: null,
    goalApprovedAt: null,
    deadline,
    leaderApproved: false,
    leaderApprovedBy: null,
    completedAt: null,
    subGoals: draftChecklistItems.map((item) => {
      return {
      id: createId("subgoal"),
      title: item.title,
      repeatCount: item.repeatCount,
      completedUnits: Array.from({ length: item.repeatCount }, () => null)
    };
    })
  };

  activeYouthDashboardView = "goals";
  await persistGoal(goal, { isCreate: true, createdBy: sessionUser.id });
  form.reset();
  render();
}

function setActiveYouthDashboardView(view) {
  activeYouthDashboardView = view === "create" ? "create" : "goals";
  render();
}

async function createManagedGoal(event) {
  event.preventDefault();

  const sessionUser = getSessionUser();
  if (!sessionUser || !isWardAdmin(sessionUser)) {
    return;
  }

  const form = event.currentTarget;
  const targetYouthId = form.elements.targetYouthId.value;
  const targetYouth = state.users.find((user) => user.id === targetYouthId);
  const title = form.elements.goalTitle.value.trim();
  const summary = form.elements.goalSummary.value.trim();
  const points = normalizePointValue(form.elements.goalPoints.value);
  const deadline = form.elements.goalDeadline.value;
  const draftChecklistItems = readDraftChecklistItems(form);

  if (!targetYouth || !canManageYouth(sessionUser, targetYouth) || !title || !summary || !deadline || !draftChecklistItems.length) {
    window.alert("Please choose a youth you manage, then add a title, summary, deadline, and at least one checklist item.");
    return;
  }

  const goal = {
    id: createId("goal"),
    userId: targetYouth.id,
    title,
    summary,
    points,
    goalApproved: true,
    goalApprovedBy: sessionUser.name,
    goalApprovedAt: getTodayDateString(),
    deadline,
    leaderApproved: false,
    leaderApprovedBy: null,
    completedAt: null,
    subGoals: draftChecklistItems.map((item) => ({
      id: createId("subgoal"),
      title: item.title,
      repeatCount: item.repeatCount,
      completedUnits: Array.from({ length: item.repeatCount }, () => null)
    }))
  };

  await persistGoal(goal, { isCreate: true, createdBy: sessionUser.id });
  form.reset();
  writeDraftChecklistItems(form, []);
  render();
}

async function addSubGoal(goalId, event) {
  event.preventDefault();

  const form = event.currentTarget;
  const value = form.elements.subGoalTitle.value.trim();
  const repeatCount = parseRepeatCount(form.elements.subGoalRepeatCount.value);
  const goal = state.goals.find((item) => item.id === goalId);

  if (!goal || !value || isGoalClosed(goal) || !goal.goalApproved) {
    return;
  }

  goal.subGoals.push({
    id: createId("subgoal"),
    title: value,
    repeatCount,
    completedUnits: Array.from({ length: repeatCount }, () => null)
  });

  resetGoalPlanApproval(goal);
  resetCompletionApproval(goal);
  await persistGoal(goal);
}

async function createTemplate(event) {
  event.preventDefault();

  const sessionUser = getSessionUser();
  if (!sessionUser || !isWardAdmin(sessionUser)) {
    return;
  }

  const form = event.currentTarget;
  const title = form.elements.templateTitle.value.trim();
  const summary = form.elements.templateSummary.value.trim();
  const draftChecklistItems = readDraftChecklistItems(form);

  if (!title || !summary || !draftChecklistItems.length) {
    window.alert("Please add a template title, summary, and at least one checklist item.");
    return;
  }

  const template = {
    id: createId("template"),
    title,
    summary,
    points: normalizePointValue(form.elements.templatePoints.value),
    subGoals: draftChecklistItems.map((item) => ({
      id: createId("template-subgoal"),
      title: item.title,
      repeatCount: item.repeatCount
    }))
  };

  await persistTemplate(template, { isCreate: true, createdBy: sessionUser.id });
  activeTemplateId = template.id;
  form.reset();
  writeDraftChecklistItems(form, []);
  render();
}

async function assignTemplateToUser(templateId, userId) {
  const sessionUser = getSessionUser();
  if (!sessionUser || !isWardAdmin(sessionUser)) {
    return;
  }

  const template = state.templates.find((item) => item.id === templateId);
  const user = state.users.find((item) => item.id === userId && canManageYouth(sessionUser, item));

  if (!template || !user) {
    window.alert("Please choose a user before assigning this template.");
    return;
  }

  await persistGoal(buildGoalFromTemplate(template, user.id), {
    isCreate: true,
    createdBy: sessionUser.id,
    sourceTemplateId: template.id
  });
}

async function createYouthAccount(event) {
  event.preventDefault();

  const sessionUser = getSessionUser();
  if (!sessionUser || !isWardAdmin(sessionUser)) {
    return;
  }

  const form = event.currentTarget;
  const name = form.elements.youthName.value.trim();
  const email = form.elements.youthEmail.value.trim().toLowerCase();
  const organization = form.elements.youthOrganization.value;
  const password = form.elements.youthPassword.value;
  const allowedOrganizations = getAllowedOrganizationsForManager(sessionUser);

  if (!name || !email || !organization || !password) {
    window.alert("Please complete the youth name, email, organization, and password.");
    return;
  }

  if (!allowedOrganizations.includes(organization)) {
    window.alert("You can only create youth accounts inside the organization you manage.");
    return;
  }

  const emailInUse = state.users.some((user) => String(user.email || "").toLowerCase() === email);
  if (emailInUse) {
    window.alert("That email already has an account.");
    return;
  }

  const user = {
    id: createId("youth"),
    role: "youth",
    name,
    email,
    password,
    ward: sessionUser.ward,
    organization,
    approvalStatus: "verified"
  };

  try {
    const nextState = await backendClient.createYouthAccount(STORAGE_KEY, state, {
      user,
      password,
      fallbackState: getFallbackState()
    });
    state = normalizeState(nextState);
    saveState();
    form.reset();
    render();
  } catch (error) {
    console.warn("Youth account creation failed.", error);
    window.alert(error?.message || "The youth account could not be created right now.");
  }
}

async function approveYouthLeaderAccount(leaderId) {
  const sessionUser = getSessionUser();
  if (!sessionUser || sessionUser.role !== "bishop") {
    return;
  }

  const leader = state.users.find((user) => user.id === leaderId && user.role === "youth_leader" && user.ward === sessionUser.ward);
  if (!leader) {
    return;
  }

  try {
    leader.approvalStatus = "approved";
    const nextState = await backendClient.approveYouthLeader(STORAGE_KEY, state, {
      leaderId,
      approvedBy: sessionUser.id,
      fallbackState: getFallbackState()
    });
    state = normalizeState(nextState);
    saveState();
    render();
  } catch (error) {
    leader.approvalStatus = "pending";
    console.warn("Youth leader approval failed.", error);
    window.alert(error?.message || "The Youth leader approval could not be completed right now.");
  }
}

function buildGoalCard(goal, mode) {
  const fragment = elements.goalCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".goal-card");
  const owner = state.users.find((user) => user.id === goal.userId);
  const sessionUser = getSessionUser();
  const progress = getGoalProgress(goal);
  const status = getGoalStatus(goal);
  const goalClosed = isGoalClosed(goal);

  fragment.querySelector(".goal-owner").textContent = owner ? owner.name : "Unknown user";
  fragment.querySelector(".goal-title").textContent = goal.title;
  fragment.querySelector(".goal-summary").textContent = goal.summary;
  fragment.querySelector(".progress-value").textContent = `${progress}%`;
  fragment.querySelector(".progress-fill").style.width = `${progress}%`;

  const statusNode = fragment.querySelector(".goal-status");
  statusNode.textContent = status.label;
  statusNode.classList.add(status.className);

  const subGoalList = fragment.querySelector(".subgoal-list");
  const actions = fragment.querySelector(".goal-actions");

  const pointsRow = document.createElement("div");
  pointsRow.className = "goal-points-row";
  pointsRow.innerHTML = `
    <span class="goal-points-badge">${normalizePointValue(goal.points)} pts</span>
    <span class="subgoal-meta">${goal.leaderApproved ? "Awarded" : goal.goalApproved ? "Approved point value" : "Awaiting point approval"}</span>
  `;
  actions.appendChild(pointsRow);

  const deadlineMeta = document.createElement("p");
  deadlineMeta.className = "goal-deadline";
  deadlineMeta.textContent = goalClosed
    ? `Deadline passed on ${formatDeadline(goal.deadline)}. A Youth leader or bishop must approve an extension.`
    : `Deadline: ${formatDeadline(goal.deadline)}`;
  actions.appendChild(deadlineMeta);

  goal.subGoals.forEach((subGoal) => {
    const completedCount = getCompletedCount(subGoal);
    const row = document.createElement("div");
    row.className = "subgoal-row";
    row.classList.toggle("completed", completedCount === subGoal.repeatCount);

    const details = document.createElement("div");
    details.className = "checklist-item";
    const textWrap = document.createElement("div");
    const subGoalTitle = document.createElement("h4");
    subGoalTitle.className = "checklist-label";
    subGoalTitle.classList.toggle("completed", completedCount === subGoal.repeatCount);
    subGoalTitle.textContent = subGoal.title;
    const subGoalMeta = document.createElement("div");
    subGoalMeta.className = "subgoal-meta";
    const latestCompletedIndex = getMostRecentCompletedUnitIndex(subGoal);
    const latestCompletedDate = latestCompletedIndex >= 0 ? subGoal.completedUnits[latestCompletedIndex] : null;
    subGoalMeta.textContent = latestCompletedDate
      ? `${completedCount} of ${subGoal.repeatCount} completed. Last checked on ${formatCompletedDate(latestCompletedDate)}.`
      : `${completedCount} of ${subGoal.repeatCount} completed`;
    textWrap.append(subGoalTitle, subGoalMeta);

    const checklistTrack = document.createElement("div");
    checklistTrack.className = "checklist-track";

    for (let unitIndex = 0; unitIndex < subGoal.repeatCount; unitIndex += 1) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      const completedDate = subGoal.completedUnits?.[unitIndex] || null;
      checkbox.checked = Boolean(completedDate);
      checkbox.disabled = mode !== "youth" || goalClosed || !goal.goalApproved;
      checkbox.title = completedDate ? `Completed on ${formatCompletedDate(completedDate)}` : "Not completed yet";
      checkbox.dataset.completedDate = completedDate || "";

      if (mode === "youth") {
        checkbox.addEventListener("change", (event) => {
          toggleSubGoalUnit(goal.id, subGoal.id, unitIndex, event.target.checked);
        });
      }

      checklistTrack.appendChild(checkbox);
    }

    details.append(textWrap, checklistTrack);

    const actionWrap = document.createElement("div");
    actionWrap.className = "subgoal-actions";
    const badge = document.createElement("div");
    badge.className = "session-badge";
    badge.textContent = `${completedCount}/${subGoal.repeatCount}`;
    actionWrap.appendChild(badge);

    if ((mode === "youth_leader" || mode === "bishop") && completedCount > 0) {
      const undoButton = document.createElement("button");
      undoButton.type = "button";
      undoButton.className = "ghost-button";
      undoButton.textContent = "Undo Latest Check";
      undoButton.addEventListener("click", () => undoLatestSubGoalCompletion(goal.id, subGoal.id));
      actionWrap.appendChild(undoButton);
    }

    row.append(details, actionWrap);
    subGoalList.appendChild(row);
  });

  if (mode === "youth" && !goal.goalApproved) {
    const note = document.createElement("p");
    note.className = "leader-summary";
    note.textContent = "This goal is waiting for a Youth leader or bishop to approve it and assign points before work begins.";
    actions.appendChild(note);
  } else if (mode === "youth" && goalClosed) {
    const note = document.createElement("p");
    note.className = "leader-summary";
    note.textContent = "This goal is closed because its deadline passed. A Youth leader or bishop must approve an extension before you can keep working on it.";
    actions.appendChild(note);
  } else if (mode === "youth" && progress === 100 && !goal.leaderApproved) {
    const note = document.createElement("p");
    note.className = "leader-summary";
    note.textContent = "This goal is complete and ready for final Youth leader or bishop approval.";
    actions.appendChild(note);
  }

  if (mode === "youth" && !goalClosed && goal.goalApproved) {
    const subGoalForm = document.createElement("form");
    subGoalForm.className = "inline-form form-card";
    subGoalForm.innerHTML = `
      <label>
        <span>Add a checklist item</span>
        <input name="subGoalTitle" type="text" placeholder="Example: Meet with advisor" required>
      </label>
      <label>
        <span>Repeat count</span>
        <input name="subGoalRepeatCount" type="number" min="1" step="1" value="1" required>
      </label>
      <button class="secondary-button" type="submit">Add Checklist Item</button>
    `;
    subGoalForm.addEventListener("submit", (event) => addSubGoal(goal.id, event));
    actions.appendChild(subGoalForm);
  }

  if (mode === "youth_leader" || mode === "bishop") {
    const note = document.createElement("div");
    note.className = "leader-summary";
    note.textContent = goal.leaderApproved
      ? `Goal plan approved by ${goal.goalApprovedBy || "a leader"}${goal.goalApprovedAt ? ` on ${goal.goalApprovedAt}` : ""}. Completed goal approved by ${goal.leaderApprovedBy} on ${goal.completedAt}.`
      : goalClosed
        ? "This goal is closed because its deadline passed. Approve a new deadline to extend it."
        : !goal.goalApproved
          ? "Review this goal, assign points, and approve it before the youth begins work."
          : progress === 100
            ? "Goal plan is approved. Review the completed work for final approval."
            : `Goal plan approved by ${goal.goalApprovedBy || "a leader"}${goal.goalApprovedAt ? ` on ${goal.goalApprovedAt}` : ""}. Waiting for the youth to finish every checklist item.`;
    actions.appendChild(note);

    if (!goal.goalApproved && !goalClosed) {
      const approvalForm = document.createElement("form");
      approvalForm.className = "inline-form form-card";
      approvalForm.innerHTML = `
        <h4>Approve Goal Plan</h4>
        <label>
          <span>Point value</span>
          <input name="approvalPoints" type="number" min="0" step="1" value="${normalizePointValue(goal.points)}" required>
        </label>
        <button class="primary-button" type="submit">Approve Goal Plan</button>
      `;
      approvalForm.addEventListener("submit", (event) => {
        event.preventDefault();
        approveGoalPlan(goal.id, approvalForm.elements.approvalPoints.value);
      });
      actions.appendChild(approvalForm);
    } else if (goalClosed) {
      const extensionForm = document.createElement("form");
      extensionForm.className = "inline-form form-card";
      extensionForm.innerHTML = `
        <label>
          <span>New deadline</span>
          <input name="extensionDeadline" type="date" min="${addDays(getTodayDateString(), 1)}" value="${addDays(getTodayDateString(), 7)}" required>
        </label>
        <button class="secondary-button" type="submit">Approve Extension</button>
      `;
      extensionForm.addEventListener("submit", (event) => {
        event.preventDefault();
        approveGoalExtension(goal.id, extensionForm.elements.extensionDeadline.value);
      });
      actions.appendChild(extensionForm);
    } else if (!goal.leaderApproved) {
      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.className = "secondary-button";
      approveButton.textContent = "Approve Completed Goal";
      approveButton.disabled = progress !== 100;
      approveButton.addEventListener("click", () => approveGoal(goal.id));
      actions.appendChild(approveButton);
    }
  }

  if ((mode === "youth_leader" || mode === "bishop") && sessionUser) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "ghost-button";
    editButton.textContent = "Edit Goal";
    editButton.addEventListener("click", () => openGoalEditor(goal.id));
    actions.appendChild(editButton);
  }

  if (mode === "youth" && !isSupabaseRuntime) {
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "ghost-button";
    resetButton.textContent = "Reset to first-run state";
    resetButton.addEventListener("click", resetFirstRunState);
    actions.appendChild(resetButton);
  }

  return card;
}

function buildGoalEditorOverlay(sessionUser) {
  if (!sessionUser || !isWardAdmin(sessionUser) || !activeGoalEditorId) {
    return null;
  }

  const goal = state.goals.find((item) => item.id === activeGoalEditorId);
  const owner = goal ? state.users.find((user) => user.id === goal.userId) : null;
  if (!goal || !owner || !canManageYouth(sessionUser, owner)) {
    activeGoalEditorId = null;
    return null;
  }

  const managedYouthOptions = getManagedYouth(sessionUser)
    .filter((user) => user.id !== goal.userId)
    .map((user) => `<option value="${user.id}">${user.name} (${getOrganizationLabel(user.organization)})</option>`)
    .join("");

  const overlay = document.createElement("section");
  overlay.className = "goal-editor-overlay";
  overlay.innerHTML = `
    <div class="goal-editor-screen" role="dialog" aria-modal="true" aria-label="Edit goal">
      <div class="goal-editor-header">
        <div>
          <p class="eyebrow">Edit Goal</p>
          <h2>${goal.title}</h2>
          <p class="subgoal-meta">${owner.name} (${getOrganizationLabel(owner.organization)})</p>
        </div>
        <button class="ghost-button" type="button" data-action="close-editor">Close</button>
      </div>
      <form class="inline-form goal-editor-form">
        <div class="goal-editor-grid">
          <label>
            <span>Goal title</span>
            <input name="editGoalTitle" type="text" value="${goal.title.replace(/"/g, "&quot;")}" required>
          </label>
          <label>
            <span>Point value</span>
            <input name="editGoalPoints" type="number" min="0" step="1" value="${normalizePointValue(goal.points)}" required>
          </label>
          <label>
            <span>Deadline</span>
            <input name="editGoalDeadline" type="date" value="${goal.deadline}" required>
          </label>
        </div>
        <label>
          <span>Goal summary</span>
          <textarea name="editGoalSummary">${goal.summary}</textarea>
        </label>
        <div class="editable-subgoal-list">
          ${buildEditableSubgoalRows(goal.subGoals)}
        </div>
        <div class="goal-editor-grid">
          <label>
            <span>Copy to youth</span>
            <select name="copyGoalTarget">
              <option value="">Choose youth</option>
              ${managedYouthOptions}
            </select>
          </label>
          <div class="template-action-wrap">
            <button class="secondary-button" type="button" data-action="copy-goal">Copy Goal</button>
          </div>
        </div>
        <div class="admin-action-row">
          <button class="secondary-button" type="button" data-action="save-template">Make Template</button>
          <button class="primary-button" type="submit">Save Goal Changes</button>
        </div>
      </form>
    </div>
  `;

  const form = overlay.querySelector(".goal-editor-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateGoalDetails(goal.id, form);
    activeGoalEditorId = null;
    render();
  });
  overlay.querySelector("[data-action='close-editor']").addEventListener("click", closeGoalEditor);
  overlay.querySelector("[data-action='save-template']").addEventListener("click", () => saveGoalAsTemplate(goal.id));
  overlay.querySelector("[data-action='copy-goal']").addEventListener("click", () => copyGoalToYouth(goal.id, form.elements.copyGoalTarget.value));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeGoalEditor();
    }
  });

  return overlay;
}

function renderUserDashboard(sessionUser) {
  const goals = state.goals.filter((goal) => goal.userId === sessionUser.id);
  elements.dashboardTitle.textContent = `${sessionUser.name}'s goals`;
  elements.userDashboard.innerHTML = "";

  const dashboardSwitch = document.createElement("div");
  dashboardSwitch.className = "tab-row user-dashboard-switch";
  dashboardSwitch.innerHTML = `
    <button class="tab-button${activeYouthDashboardView === "goals" ? " active" : ""}" type="button" data-youth-view="goals">Existing Goals</button>
    <button class="tab-button${activeYouthDashboardView === "create" ? " active" : ""}" type="button" data-youth-view="create">Create Goal</button>
  `;
  dashboardSwitch.querySelectorAll("[data-youth-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveYouthDashboardView(button.dataset.youthView));
  });
  elements.userDashboard.appendChild(dashboardSwitch);

  const formCard = document.createElement("section");
  formCard.className = "form-card";
  formCard.innerHTML = `
    <h3>Create a new goal</h3>
    <form class="inline-form" id="addGoalForm">
      <label>
        <span>Goal title</span>
        <input name="goalTitle" type="text" placeholder="Example: Finish mission preparation" required>
      </label>
      <label>
        <span>Goal summary</span>
        <textarea name="goalSummary" placeholder="Describe what success looks like." required></textarea>
      </label>
      <label>
        <span>Deadline</span>
        <input name="goalDeadline" type="date" value="${getDefaultGoalDeadline()}" min="${getTodayDateString()}" required>
      </label>
      <p class="subgoal-meta">A Youth leader or bishop can assign the point value after reviewing the goal.</p>
      <div class="draft-builder">
        <div class="draft-builder-grid">
          <label>
            <span>Checklist item description</span>
            <input name="newSubGoalTitle" type="text" placeholder="Example: Read 20 minutes a day">
          </label>
          <label>
            <span>Quantity</span>
            <input name="newSubGoalRepeatCount" type="number" min="1" step="1" value="1">
          </label>
        </div>
        <button class="secondary-button" type="button" id="addGoalChecklistItemButton">Add Checklist Item</button>
        <input name="goalSubGoalsData" type="hidden" value="[]">
        <div class="draft-checklist-list"></div>
      </div>
      <button class="primary-button" type="submit">Create Goal</button>
    </form>
  `;
  const addGoalForm = formCard.querySelector("#addGoalForm");
  addGoalForm.addEventListener("submit", addGoal);
  addGoalForm.querySelector("#addGoalChecklistItemButton").addEventListener("click", () => addDraftChecklistItem(addGoalForm));
  renderDraftChecklistItems(addGoalForm);

  const goalsWrap = document.createElement("div");
  goalsWrap.className = "goal-list";
  if (goals.length) {
    goals.forEach((goal) => {
      goalsWrap.appendChild(buildGoalCard(goal, "youth"));
    });
  } else {
    const emptyCard = document.createElement("section");
    emptyCard.className = "form-card goal-list-empty";
    emptyCard.innerHTML = `
      <h3>No goals yet</h3>
      <p>Create your first goal when you are ready to start tracking progress.</p>
      <button class="secondary-button" type="button">Create Goal</button>
    `;
    emptyCard.querySelector("button").addEventListener("click", () => setActiveYouthDashboardView("create"));
    goalsWrap.appendChild(emptyCard);
  }

  if (activeYouthDashboardView === "create") {
    elements.userDashboard.appendChild(formCard);
  } else {
    elements.userDashboard.appendChild(goalsWrap);
  }
}

function buildTemplateWorkspace(template) {
  const sessionUser = getSessionUser();
  const canAssignTemplate = Boolean(template && sessionUser && isWardAdmin(sessionUser));
  const managedYouthOptions = canAssignTemplate
    ? getManagedYouth(sessionUser).map((user) => `<option value="${user.id}">${user.name} (${getOrganizationLabel(user.organization)})</option>`).join("")
    : "";
  const card = document.createElement("section");
  card.className = "template-workspace";
  const templateListMarkup = state.templates.map((item) => `
    <button class="template-list-item${template && item.id === template.id ? " active" : ""}" type="button" data-template-id="${item.id}">
      <strong>${item.title}</strong>
      <span>${item.subGoals.length} checklist item${item.subGoals.length === 1 ? "" : "s"}</span>
    </button>
  `).join("");
  const editorMarkup = template ? `
    <form class="inline-form template-edit-form">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Template Editor</p>
          <h3>${template.title}</h3>
        </div>
        <div class="session-badge">${template.subGoals.length} checklist item${template.subGoals.length === 1 ? "" : "s"}</div>
      </div>
      <label>
        <span>Template title</span>
        <input name="editTemplateTitle" type="text" value="${template.title.replace(/"/g, "&quot;")}">
      </label>
      <label>
        <span>Template summary</span>
        <textarea name="editTemplateSummary">${template.summary}</textarea>
      </label>
      <label>
        <span>Default points</span>
        <input name="editTemplatePoints" type="number" min="0" step="1" value="${normalizePointValue(template.points)}" required>
      </label>
      <div class="editable-subgoal-list">
        ${buildEditableSubgoalRows(template.subGoals)}
      </div>
      ${canAssignTemplate ? `
      <div class="draft-builder-grid">
        <label>
          <span>Copy template to youth</span>
          <select class="template-user-select" name="templateAssignTarget">
            <option value="">Choose youth</option>
            ${managedYouthOptions}
          </select>
        </label>
        <div class="template-action-wrap">
          <button class="secondary-button" type="button" data-action="assign-template">Copy Goal To Youth</button>
        </div>
      </div>
      ` : ""}
      <button class="primary-button" type="submit">Save Template Changes</button>
    </form>
  ` : `
    <div class="template-empty-state">
      <p class="eyebrow">Template Editor</p>
      <h3>Template form cleared</h3>
      <p>Select a template from the list to edit it, or use the create-template form above to make a new one.</p>
    </div>
  `;

  card.innerHTML = `
    <div class="form-card template-editor-card">
      ${editorMarkup}
    </div>
    <aside class="form-card template-sidebar">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Existing Templates</p>
          <h3>Template List</h3>
        </div>
        <div class="session-badge">${state.templates.length}</div>
      </div>
      <div class="template-list">
        ${templateListMarkup}
      </div>
    </aside>
  `;

  const form = card.querySelector(".template-edit-form");
  if (form && template) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateTemplateDetails(template.id, form);
    });
    form.querySelector("[data-action='assign-template']")?.addEventListener("click", () => {
      assignTemplateToUser(template.id, form.elements.templateAssignTarget.value);
    });
  }
  card.querySelectorAll("[data-template-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTemplateId = button.dataset.templateId;
      render();
    });
  });

  return card;
}

function renderLeaderDashboard(sessionUser) {
  const goals = state.goals
    .filter((goal) => {
      const owner = state.users.find((user) => user.id === goal.userId);
      return owner && canManageYouth(sessionUser, owner);
    })
    .sort((a, b) => getGoalProgress(b) - getGoalProgress(a));
  const approvedCount = goals.filter((goal) => goal.leaderApproved).length;
  const readyCount = goals.filter((goal) => goal.goalApproved && getGoalProgress(goal) === 100 && !goal.leaderApproved).length;
  const pendingPlanCount = goals.filter((goal) => !goal.goalApproved).length;
  const managedYouth = getManagedYouth(sessionUser);
  const youthOptions = managedYouth.map((user) => `<option value="${user.id}">${user.name} (${getOrganizationLabel(user.organization)})</option>`).join("");
  const allowedOrganizations = getAllowedOrganizationsForManager(sessionUser);
  const organizationOptions = allowedOrganizations
    .map((organization) => `<option value="${organization}">${getOrganizationLabel(organization)}</option>`)
    .join("");
  const templateOptions = state.templates.map((template) => `<option value="${template.id}">${template.title}</option>`).join("");

  elements.dashboardTitle.textContent = sessionUser.role === "bishop" ? `${sessionUser.name}'s ward board` : `${sessionUser.name}'s youth board`;
  elements.leaderDashboard.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "leader-summary";
  summary.innerHTML = `
    <strong>${approvedCount}</strong> goals approved
    <br>
    <strong>${readyCount}</strong> goals waiting for Youth leader sign-off
    <br>
    <strong>${pendingPlanCount}</strong> goals waiting for goal approval
  `;
  elements.leaderDashboard.appendChild(summary);

  const managedGoalForm = document.createElement("section");
  managedGoalForm.className = "form-card";
  managedGoalForm.innerHTML = `
    <h3>Create a goal for youth</h3>
    <form class="inline-form" id="createManagedGoalForm">
      <label>
        <span>Youth</span>
        <select name="targetYouthId">
          <option value="">Choose a youth</option>
          ${youthOptions}
        </select>
      </label>
      <div class="draft-builder-grid">
        <label>
          <span>Start from template</span>
          <select name="goalTemplateId">
            <option value="">Blank goal</option>
            ${templateOptions}
          </select>
        </label>
        <div class="template-action-wrap">
          <button class="secondary-button" type="button" id="copyFromTemplateButton">Copy From Template</button>
        </div>
      </div>
      <label>
        <span>Goal title</span>
        <input name="goalTitle" type="text" placeholder="Example: 60-day service challenge" required>
      </label>
      <label>
        <span>Goal summary</span>
        <textarea name="goalSummary" placeholder="Describe what success looks like." required></textarea>
      </label>
      <label>
        <span>Point value</span>
        <input name="goalPoints" type="number" min="0" step="1" value="0" required>
      </label>
      <label>
        <span>Deadline</span>
        <input name="goalDeadline" type="date" value="${getDefaultGoalDeadline()}" min="${getTodayDateString()}" required>
      </label>
      <div class="draft-builder">
        <div class="draft-builder-grid">
          <label>
            <span>Checklist item description</span>
            <input name="newSubGoalTitle" type="text" placeholder="Example: Offer daily prayer">
          </label>
          <label>
            <span>Quantity</span>
            <input name="newSubGoalRepeatCount" type="number" min="1" step="1" value="1">
          </label>
        </div>
        <button class="secondary-button" type="button" id="addManagedGoalChecklistItemButton">Add Checklist Item</button>
        <input name="goalSubGoalsData" type="hidden" value="[]">
        <div class="draft-checklist-list"></div>
      </div>
      <button class="primary-button" type="submit">Create Goal For Youth</button>
    </form>
  `;
  const createManagedGoalForm = managedGoalForm.querySelector("#createManagedGoalForm");
  createManagedGoalForm.addEventListener("submit", createManagedGoal);
  createManagedGoalForm.querySelector("#copyFromTemplateButton").addEventListener("click", () => {
    syncGoalFormFromTemplate(createManagedGoalForm, createManagedGoalForm.elements.goalTemplateId.value);
  });
  createManagedGoalForm.querySelector("#addManagedGoalChecklistItemButton").addEventListener("click", () => addDraftChecklistItem(createManagedGoalForm));
  renderDraftChecklistItems(createManagedGoalForm);
  elements.leaderDashboard.appendChild(managedGoalForm);

  const youthAccountForm = document.createElement("section");
  youthAccountForm.className = "form-card";
  youthAccountForm.innerHTML = `
    <h3>Create a youth account</h3>
    <form class="inline-form" id="createYouthAccountForm">
      <label>
        <span>Youth full name</span>
        <input name="youthName" type="text" placeholder="Enter youth full name" required>
      </label>
      <label>
        <span>Youth email</span>
        <input name="youthEmail" type="email" placeholder="Enter youth email" required>
      </label>
      <label>
        <span>Organization</span>
        <select name="youthOrganization">
          ${organizationOptions}
        </select>
      </label>
      <label>
        <span>Temporary password</span>
        <input name="youthPassword" type="password" placeholder="Create a password" required>
      </label>
      <button class="primary-button" type="submit">Create Youth Account</button>
    </form>
  `;
  youthAccountForm.querySelector("#createYouthAccountForm").addEventListener("submit", createYouthAccount);
  elements.leaderDashboard.appendChild(youthAccountForm);

  const templateForm = document.createElement("section");
  templateForm.className = "form-card";
  templateForm.innerHTML = `
    <h3>Create a goal template</h3>
    <form class="inline-form" id="createTemplateForm">
      <label>
        <span>Template title</span>
        <input name="templateTitle" type="text" placeholder="Example: 90-day reading challenge" required>
      </label>
      <label>
        <span>Template summary</span>
        <textarea name="templateSummary" placeholder="Describe what this goal template is for." required></textarea>
      </label>
      <label>
        <span>Default points</span>
        <input name="templatePoints" type="number" min="0" step="1" value="0" required>
      </label>
      <div class="draft-builder">
        <div class="draft-builder-grid">
          <label>
            <span>Checklist item description</span>
            <input name="newSubGoalTitle" type="text" placeholder="Example: Read 20 minutes a day">
          </label>
          <label>
            <span>Quantity</span>
            <input name="newSubGoalRepeatCount" type="number" min="1" step="1" value="1">
          </label>
        </div>
        <button class="secondary-button" type="button" id="addTemplateChecklistItemButton">Add Checklist Item</button>
        <input name="goalSubGoalsData" type="hidden" value="[]">
        <div class="draft-checklist-list"></div>
      </div>
      <button class="primary-button" type="submit">Save Template</button>
    </form>
  `;

  const createTemplateForm = templateForm.querySelector("#createTemplateForm");
  createTemplateForm.addEventListener("submit", createTemplate);
  createTemplateForm.querySelector("#addTemplateChecklistItemButton").addEventListener("click", () => addDraftChecklistItem(createTemplateForm));
  renderDraftChecklistItems(createTemplateForm);
  elements.leaderDashboard.appendChild(templateForm);

  const activeTemplate = getActiveTemplate();
  const templatesWrap = document.createElement("div");
  templatesWrap.className = "template-grid";
  templatesWrap.appendChild(buildTemplateWorkspace(activeTemplate));
  elements.leaderDashboard.appendChild(templatesWrap);

  goals.forEach((goal) => {
    elements.leaderDashboard.appendChild(buildGoalCard(goal, "youth_leader"));
  });
}

function renderBishopDashboard(sessionUser) {
  renderLeaderDashboard(sessionUser);

  const managedYouth = getManagedYouth(sessionUser);
  const pendingLeaders = getPendingWardLeaders(sessionUser.ward);
  const approvedLeaders = state.users.filter((user) => user.role === "youth_leader" && user.ward === sessionUser.ward && user.approvalStatus === "approved");

  const summary = document.createElement("div");
  summary.className = "leader-summary";
  summary.innerHTML = `
    <strong>${managedYouth.length}</strong> youth in ${sessionUser.ward}
    <br>
    <strong>${approvedLeaders.length}</strong> approved Youth leaders
    <br>
    <strong>${pendingLeaders.length}</strong> Youth leaders waiting for bishop approval
  `;
  elements.leaderDashboard.prepend(summary);

  const info = document.createElement("section");
  info.className = "form-card";
  info.innerHTML = `
    <h3>Ward approval</h3>
    <p class="leader-summary">Ward is required for every account. Youth leaders only gain access to youth in the same ward after bishop approval. Automatic Church website verification is not enabled in this browser-only version.</p>
  `;
  elements.leaderDashboard.insertBefore(info, elements.leaderDashboard.children[1] || null);

  pendingLeaders.forEach((leader) => {
    const card = document.createElement("section");
    card.className = "form-card";
    card.innerHTML = `
      <div class="panel-header">
        <div>
          <p class="eyebrow">Pending Youth Leader</p>
          <h3>${leader.name}</h3>
        </div>
        <div class="session-badge">${leader.ward}</div>
      </div>
      <p class="leader-summary">${leader.email}</p>
      <button class="primary-button" type="button">Approve Youth Leader</button>
    `;
    card.querySelector("button").addEventListener("click", () => approveYouthLeaderAccount(leader.id));
    elements.leaderDashboard.insertBefore(card, elements.leaderDashboard.children[2 + pendingLeaders.indexOf(leader)] || null);
  });
}

function render() {
  try {
  document.querySelectorAll(".goal-editor-overlay").forEach((overlay) => overlay.remove());
  if (!bootstrappedState) {
    elements.dashboardTitle.textContent = "Loading goal tracker";
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.innerHTML = "<h3>Loading data</h3><p>Preparing the current app state and backend mode.</p>";
    elements.userDashboard.classList.add("hidden");
    elements.leaderDashboard.classList.add("hidden");
    renderSessionProgressTracker(null);
    return;
  }

  const sessionUser = getSessionUser();
  const loggedIn = Boolean(sessionUser);

  elements.loginView.classList.toggle("hidden", loggedIn);
  elements.sessionView.classList.toggle("hidden", !loggedIn);
  elements.logoutButton.classList.toggle("hidden", !loggedIn);
  elements.emptyState.classList.toggle("hidden", loggedIn);
  elements.userDashboard.classList.add("hidden");
  elements.leaderDashboard.classList.add("hidden");
  elements.userDashboard.innerHTML = "";
  elements.leaderDashboard.innerHTML = "";

  if (!loggedIn) {
    elements.dashboardTitle.textContent = "Choose a login to get started";
    renderSessionProgressTracker(null);
    return;
  }

  elements.sessionTitle.textContent = sessionUser.name;
  elements.sessionDescription.textContent = sessionUser.role === "bishop"
    ? "Approve Youth leaders in your ward and oversee ward access."
    : sessionUser.role === "youth_leader"
      ? "Create youth accounts, manage templates, and sign off completed goals for youth in your ward."
      : "Check off sub-goals as you finish them and the overall progress bar will update automatically.";

  elements.sessionBadge.textContent =
    sessionUser.role === "bishop" ? "Bishop Session" :
    sessionUser.role === "youth_leader" ? "Youth Leader Session" :
    "Youth Session";
  renderSessionProgressTracker(sessionUser);

  if (sessionUser.role === "bishop") {
    elements.leaderDashboard.classList.remove("hidden");
    renderBishopDashboard(sessionUser);
  } else if (sessionUser.role === "youth_leader") {
    elements.leaderDashboard.classList.remove("hidden");
    renderLeaderDashboard(sessionUser);
  } else {
    elements.userDashboard.classList.remove("hidden");
    renderUserDashboard(sessionUser);
  }

  const editorOverlay = buildGoalEditorOverlay(sessionUser);
  if (editorOverlay) {
    document.body.appendChild(editorOverlay);
  }
  } catch (error) {
    console.warn("Render failed.", error);
    elements.dashboardTitle.textContent = "Something went wrong";
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.innerHTML = "<h3>Dashboard error</h3><p>The page hit an unexpected error while rendering. Please refresh and try again.</p>";
    elements.userDashboard.classList.add("hidden");
    elements.leaderDashboard.classList.add("hidden");
    renderSessionProgressTracker(null);
  }
}

elements.userTab.addEventListener("click", () => setActiveRole("youth"));
elements.leaderTab.addEventListener("click", () => setActiveRole("youth_leader"));
elements.bishopTab.addEventListener("click", () => setActiveRole("bishop"));
elements.signInModeButton.addEventListener("click", () => setUserAuthMode("signin"));
elements.createAccountModeButton.addEventListener("click", () => setUserAuthMode("create"));
elements.loginForm.addEventListener("submit", login);
elements.registerForm.addEventListener("submit", registerUser);
elements.logoutButton.addEventListener("click", logout);

setActiveRole("youth");
renderRuntimeBanner();
render();
Promise.race([
  loadState().then((loadedState) => {
    state = loadedState;
    return authClient.hydrateSession(state);
  }),
  createTimeoutPromise("App bootstrap", BOOTSTRAP_TIMEOUT_MS)
]).then((result) => {
  if (result?.appState) {
    state = normalizeState(result.appState);
  }
  if (typeof result?.session !== "undefined") {
    state.session = result.session;
  }
  bootstrappedState = true;
  render();
}).catch((error) => {
  console.warn("App bootstrap failed; falling back to cached local state.", error);
  state = loadCachedState();
  bootstrappedState = true;
  render();
});
