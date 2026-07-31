// Popup — a view of chrome.storage.local session state. Owns no session logic;
// it sends start/stop messages to the background worker and reflects storage.

const techniqueSelect = document.getElementById("technique");
const durationRow = document.getElementById("duration-row");
const durationInput = document.getElementById("duration");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const notesBtn = document.getElementById("notes-btn");
const startView = document.getElementById("start-view");
const activeView = document.getElementById("active-view");
const countdownEl = document.getElementById("countdown");
const phaseLabelEl = document.getElementById("phase-label");
const optionsLink = document.getElementById("options-link");

let renderTimer = null;

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function render() {
  const { session } = await chrome.storage.local.get("session");
  const active = session?.active ?? false;

  startView.classList.toggle("hidden", active);
  activeView.classList.toggle("hidden", !active);

  if (!active) {
    if (renderTimer) {
      clearInterval(renderTimer);
      renderTimer = null;
    }
    return;
  }

  notesBtn.classList.toggle("hidden", session.technique !== "feynman");

  if (session.technique === "pomodoro") {
    phaseLabelEl.textContent =
      session.phase === "work" ? "Pomodoro — focus (sites locked)" : "Pomodoro — break";
  } else if (session.technique === "feynman") {
    phaseLabelEl.textContent = "Feynman session";
  } else {
    phaseLabelEl.textContent = "Focus lock active";
  }

  // The countdown is always computed from endTime vs now — the popup can be
  // closed and reopened mid-session without losing anything.
  countdownEl.textContent = formatRemaining(session.endTime - Date.now());

  if (!renderTimer) {
    renderTimer = setInterval(render, 500);
  }
}

startBtn.addEventListener("click", async () => {
  const technique = techniqueSelect.value;
  const durationMinutes = Number(durationInput.value) || 25;
  await chrome.runtime.sendMessage({ type: "start-session", technique, durationMinutes });
  if (technique === "feynman") {
    chrome.tabs.create({ url: chrome.runtime.getURL("feynman.html") });
  }
  render();
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop-session" });
  render();
});

notesBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("feynman.html") });
});

optionsLink.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Pomodoro's duration is taken from settings, so hide the duration input for it.
techniqueSelect.addEventListener("change", () => {
  durationRow.classList.toggle("hidden", techniqueSelect.value === "pomodoro");
});

// React to background-driven state changes (phase flips, session end).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.session) render();
});

render();
