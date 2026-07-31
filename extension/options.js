// Options page — blocking mode, domain lists, and Pomodoro settings. No session logic.

const workMinutesInput = document.getElementById("work-minutes");
const breakMinutesInput = document.getElementById("break-minutes");
const modeRadios = document.querySelectorAll('input[name="blocking-mode"]');
const allowlistSection = document.getElementById("allowlist-section");
const blocklistSection = document.getElementById("blocklist-section");

// Strip scheme/path/www so "https://www.youtube.com/watch" becomes "youtube.com".
function normalizeDomain(raw) {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "");
  d = d.split("/")[0].split("?")[0];
  d = d.replace(/^www\./, "");
  return d;
}

function isValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);
}

// Wire up one domain list (both lists behave identically, just different storage keys).
function setupDomainList(storageKey, inputId, addBtnId, listId, emptyText) {
  const input = document.getElementById(inputId);
  const addBtn = document.getElementById(addBtnId);
  const listEl = document.getElementById(listId);

  async function getList() {
    const stored = await chrome.storage.local.get(storageKey);
    return stored[storageKey] ?? [];
  }

  async function renderList() {
    const domains = await getList();
    listEl.innerHTML = "";
    if (domains.length === 0) {
      const li = document.createElement("li");
      li.textContent = emptyText;
      listEl.appendChild(li);
      return;
    }
    for (const domain of domains) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = domain;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        const current = await getList();
        await chrome.storage.local.set({
          [storageKey]: current.filter((d) => d !== domain),
        });
        renderList();
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      listEl.appendChild(li);
    }
  }

  async function addDomain() {
    const domain = normalizeDomain(input.value);
    if (!isValidDomain(domain)) {
      input.setCustomValidity("Enter a valid domain like example.com");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    const domains = await getList();
    if (!domains.includes(domain)) {
      await chrome.storage.local.set({ [storageKey]: [...domains, domain] });
    }
    input.value = "";
    renderList();
  }

  addBtn.addEventListener("click", addDomain);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addDomain();
  });

  renderList();
}

setupDomainList(
  "allowlist",
  "allowlist-input",
  "allowlist-add-btn",
  "allowlist-list",
  "No allowed domains yet — everything will be blocked during a session."
);
setupDomainList(
  "blocklist",
  "blocklist-input",
  "blocklist-add-btn",
  "blocklist-list",
  "No blocked domains yet."
);

// ---------- Blocking mode ----------

function showSectionForMode(mode) {
  allowlistSection.classList.toggle("hidden", mode !== "allowlist");
  blocklistSection.classList.toggle("hidden", mode !== "blocklist");
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const mode = settings?.blockingMode ?? "allowlist";
  for (const radio of modeRadios) {
    radio.checked = radio.value === mode;
  }
  showSectionForMode(mode);
  workMinutesInput.value = settings?.pomodoroWorkMinutes ?? 25;
  breakMinutesInput.value = settings?.pomodoroBreakMinutes ?? 5;
}

async function saveSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  const mode = document.querySelector('input[name="blocking-mode"]:checked').value;
  await chrome.storage.local.set({
    settings: {
      ...settings,
      blockingMode: mode,
      pomodoroWorkMinutes: Math.max(1, Number(workMinutesInput.value) || 25),
      pomodoroBreakMinutes: Math.max(1, Number(breakMinutesInput.value) || 5),
    },
  });
  showSectionForMode(mode);
}

for (const radio of modeRadios) {
  radio.addEventListener("change", saveSettings);
}
workMinutesInput.addEventListener("change", saveSettings);
breakMinutesInput.addEventListener("change", saveSettings);

loadSettings();
