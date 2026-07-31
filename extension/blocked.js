// Blocked page — shows remaining session time read from storage.

const remainingEl = document.getElementById("remaining");
const messageEl = document.getElementById("message");

const MESSAGES = [
  "Future you says thanks.",
  "The distraction will still exist in 25 minutes. Your momentum won't.",
  "One session at a time.",
  "Deep work now, doomscrolling later (maybe).",
  "You put this block here for a reason.",
];

messageEl.textContent = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function tick() {
  const { session } = await chrome.storage.local.get("session");
  if (!session?.active) {
    remainingEl.textContent = "00:00";
    messageEl.textContent = "Session over — you're free to go back.";
    return;
  }
  remainingEl.textContent = formatRemaining(session.endTime - Date.now());
}

tick();
setInterval(tick, 1000);

// ---------- Safety exit ----------
// Ends the session early. A 5-second cooldown before the confirm button
// activates keeps it from being a zero-effort reflex click.

const exitBtn = document.getElementById("exit-btn");
const confirmArea = document.getElementById("confirm-area");
const confirmEndBtn = document.getElementById("confirm-end-btn");
const cancelBtn = document.getElementById("cancel-btn");
const cooldownEl = document.getElementById("cooldown");

let cooldownTimer = null;

exitBtn.addEventListener("click", () => {
  exitBtn.classList.add("hidden");
  confirmArea.classList.remove("hidden");

  let secondsLeft = 5;
  cooldownEl.textContent = secondsLeft;
  confirmEndBtn.disabled = true;
  cooldownTimer = setInterval(() => {
    secondsLeft -= 1;
    cooldownEl.textContent = Math.max(0, secondsLeft);
    if (secondsLeft <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      confirmEndBtn.disabled = false;
    }
  }, 1000);
});

cancelBtn.addEventListener("click", () => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  confirmArea.classList.add("hidden");
  exitBtn.classList.remove("hidden");
});

confirmEndBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop-session" });
  // Rules are gone now — go back to wherever the user was headed.
  if (history.length > 1) {
    history.back();
  } else {
    messageEl.textContent = "Session ended. You can navigate anywhere now.";
    document.getElementById("exit-area").classList.add("hidden");
  }
});
