// Focus & Study — background service worker.
// Single source of truth for session lifecycle. All timing is alarm-driven
// (MV3 service workers are suspended after ~30s idle, so setInterval is unusable here).

const ALARM_SESSION_END = "session-end";
const ALARM_POMODORO_PHASE_END = "pomodoro-phase-end";

// Dynamic DNR rule ids start here; one rule per listed domain (plus the
// catch-all rule in allowlist mode).
const RULE_ID_OFFSET = 1000;

const DEFAULT_STATE = {
  session: {
    active: false,
    technique: null, // "pomodoro" | "feynman" | "plain-lock" | null
    startTime: 0,
    endTime: 0,
    phase: null, // "work" | "break" | null
  },
  blocklist: [],
  allowlist: [],
  settings: {
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5,
    // "allowlist": block everything EXCEPT the allowlist (study-portal mode).
    // "blocklist": block ONLY the blocklist.
    blockingMode: "allowlist",
  },
};

// ---------- Storage helpers ----------

async function getState() {
  const stored = await chrome.storage.local.get([
    "session",
    "blocklist",
    "allowlist",
    "settings",
  ]);
  return {
    session: { ...DEFAULT_STATE.session, ...stored.session },
    blocklist: stored.blocklist ?? DEFAULT_STATE.blocklist,
    allowlist: stored.allowlist ?? DEFAULT_STATE.allowlist,
    settings: { ...DEFAULT_STATE.settings, ...stored.settings },
  };
}

async function setSession(session) {
  await chrome.storage.local.set({ session });
}

// ---------- Domain blocking (declarativeNetRequest) ----------

async function applyBlockRules(state) {
  await clearBlockRules();
  const rules = [];

  if (state.settings.blockingMode === "allowlist") {
    // Block every page navigation by default...
    rules.push({
      id: RULE_ID_OFFSET,
      priority: 1,
      action: {
        type: "redirect",
        redirect: { extensionPath: "/blocked.html" },
      },
      condition: {
        // No urlFilter = matches all URLs.
        resourceTypes: ["main_frame"],
      },
    });
    // ...then punch holes for each allowed domain (higher priority wins).
    state.allowlist.forEach((domain, i) => {
      rules.push({
        id: RULE_ID_OFFSET + 1 + i,
        priority: 2,
        action: { type: "allow" },
        condition: {
          // "||domain^" matches the domain and all its subdomains, any scheme.
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"],
        },
      });
    });
  } else {
    state.blocklist.forEach((domain, i) => {
      rules.push({
        id: RULE_ID_OFFSET + i,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: "/blocked.html" },
        },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ["main_frame"],
        },
      });
    });
  }

  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  }
}

async function clearBlockRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.map((r) => r.id);
  if (ids.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  }
}

// ---------- Session lifecycle ----------

async function startSession(technique, durationMinutes) {
  const state = await getState();
  const now = Date.now();

  if (technique === "pomodoro") {
    const workMs = state.settings.pomodoroWorkMinutes * 60 * 1000;
    await setSession({
      active: true,
      technique: "pomodoro",
      startTime: now,
      endTime: now + workMs,
      phase: "work",
    });
    await applyBlockRules(state);
    chrome.alarms.create(ALARM_POMODORO_PHASE_END, { when: now + workMs });
  } else {
    // plain-lock, or feynman with an optional lock duration
    const durationMs = durationMinutes * 60 * 1000;
    await setSession({
      active: true,
      technique,
      startTime: now,
      endTime: now + durationMs,
      phase: null,
    });
    await applyBlockRules(state);
    chrome.alarms.create(ALARM_SESSION_END, { when: now + durationMs });
  }
}

async function stopSession() {
  await chrome.alarms.clear(ALARM_SESSION_END);
  await chrome.alarms.clear(ALARM_POMODORO_PHASE_END);
  await clearBlockRules();
  await setSession({ ...DEFAULT_STATE.session });
}

// Pomodoro: toggle work/break, re-arm the alarm, lock only during work.
async function advancePomodoroPhase() {
  const state = await getState();
  if (!state.session.active || state.session.technique !== "pomodoro") return;

  const now = Date.now();
  const nextPhase = state.session.phase === "work" ? "break" : "work";
  const nextMinutes =
    nextPhase === "work"
      ? state.settings.pomodoroWorkMinutes
      : state.settings.pomodoroBreakMinutes;
  const nextMs = nextMinutes * 60 * 1000;

  await setSession({
    ...state.session,
    startTime: now,
    endTime: now + nextMs,
    phase: nextPhase,
  });

  if (nextPhase === "work") {
    await applyBlockRules(state);
  } else {
    await clearBlockRules();
  }

  chrome.alarms.create(ALARM_POMODORO_PHASE_END, { when: now + nextMs });
}

// ---------- Event wiring ----------

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "session",
    "blocklist",
    "allowlist",
    "settings",
  ]);
  await chrome.storage.local.set({
    session: stored.session ?? DEFAULT_STATE.session,
    blocklist: stored.blocklist ?? DEFAULT_STATE.blocklist,
    allowlist: stored.allowlist ?? DEFAULT_STATE.allowlist,
    settings: { ...DEFAULT_STATE.settings, ...stored.settings },
  });
  // Rules don't survive reinstall/update in a meaningful state; reset cleanly.
  await clearBlockRules();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SESSION_END) {
    await stopSession();
  } else if (alarm.name === ALARM_POMODORO_PHASE_END) {
    await advancePomodoroPhase();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "start-session") {
      await startSession(message.technique, message.durationMinutes);
      sendResponse({ ok: true });
    } else if (message.type === "stop-session") {
      await stopSession();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "unknown message type" });
    }
  })();
  return true; // keep the message channel open for the async response
});

// If the domain lists or blocking mode change mid-session while locking is
// active, refresh the rules so edits take effect immediately.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (!changes.blocklist && !changes.allowlist && !changes.settings) return;
  const state = await getState();
  const lockActive =
    state.session.active &&
    (state.session.technique !== "pomodoro" || state.session.phase === "work");
  if (lockActive) {
    await applyBlockRules(state);
  }
});
