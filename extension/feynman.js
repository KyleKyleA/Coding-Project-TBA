// Feynman notes — auto-saved to chrome.storage.local under "feynmanNotes".

const FIELDS = ["topic", "step1", "step2", "step3", "step4"];
const statusEl = document.getElementById("status");

let saveTimer = null;

async function loadNotes() {
  const { feynmanNotes } = await chrome.storage.local.get("feynmanNotes");
  if (!feynmanNotes) return;
  for (const field of FIELDS) {
    document.getElementById(field).value = feynmanNotes[field] ?? "";
  }
}

function scheduleSave() {
  statusEl.textContent = "";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const feynmanNotes = { updatedAt: Date.now() };
    for (const field of FIELDS) {
      feynmanNotes[field] = document.getElementById(field).value;
    }
    await chrome.storage.local.set({ feynmanNotes });
    statusEl.textContent = "Saved.";
  }, 400);
}

for (const field of FIELDS) {
  document.getElementById(field).addEventListener("input", scheduleSave);
}

loadNotes();
