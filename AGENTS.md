# Focus & Study Technique Chrome Extension — Project Spec

## Overview
A Chrome extension (Manifest V3) that combines two integrated features:
1. **Domain locking** — blocks access to distracting domains for the duration of a focus session, while allowing unlimited tabs of any *non-blocked* domain (e.g. a university portal) to keep working normally.
2. **Study technique library** — built-in timers/guides for study techniques (Pomodoro, Feynman technique, etc.) that share the same session/timer engine as the domain lock.

The two features are tightly integrated: starting a study session (e.g. a Pomodoro work interval) can simultaneously activate the domain lock for its duration.

## Core Behavior
- User defines a **blocklist** of domains (e.g. `youtube.com`, `reddit.com`) in an options page.
- User starts a **session** (either a plain focus lock, or a study-technique session like Pomodoro).
- While a session is active:
  - Any navigation to a blocklisted domain is intercepted and redirected to a "blocked" page.
  - Domains *not* on the blocklist are completely unaffected — multiple tabs of the same allowed domain work fine.
- When the session timer ends, blocking rules are automatically removed.
- Session state must persist even if the popup is closed or the browser is idle (MV3 service workers are killed after ~30s idle — do not rely on `setInterval` in the background script).

## Architecture

```
extension/
├── manifest.json
├── background.js        (service worker — session state + alarms + DNR rules)
├── popup.html / popup.js (session controls, technique picker, live timer)
├── blocked.html          (shown when a blocklisted domain is hit mid-session)
└── options.html / options.js (manage the domain blocklist)
└── error.html / error.js(manages errors when the extension is failing it lets the user known when they can't use the extension when the server is done)
```

### manifest.json
- `manifest_version: 3`
- Permissions: `storage`, `alarms`, `declarativeNetRequest`
- Host permissions: broad enough to match user-entered domains (e.g. `<all_urls>` or dynamically scoped)
- Background: service worker (`background.js`)
- Action: popup (`popup.html`)
- Options page: `options.html`

### Storage schema (`chrome.storage.local`)
```json
{
  "session": {
    "active": false,
    "technique": "pomodoro | feynman | plain-lock | null",
    "startTime": 0,
    "endTime": 0,
    "phase": "work | break | null"
  },
  "blocklist": ["youtube.com", "reddit.com"],
  "settings": {
    "pomodoroWorkMinutes": 25,
    "pomodoroBreakMinutes": 5
  }
}
```

### background.js responsibilities
- Single source of truth for session lifecycle — popup never owns session logic, it only reads/writes storage and reflects state.
- Uses `chrome.alarms` (not `setInterval`) to track session end / Pomodoro phase transitions, so timing survives service worker suspension.
- On session start: build one `declarativeNetRequest` dynamic rule per blocklisted domain, redirecting matches to `blocked.html`.
- On session end (alarm fires): remove those dynamic rules and update `session.active` to `false`.
- For Pomodoro: on each phase-end alarm, toggle `session.phase` between `work` and `break`, and add/remove the domain-lock rules accordingly (lock only during `work` phases, unlocked during `break`).

### popup.js responsibilities
- Read current `session` state from storage on open.
- Let the user pick a technique (plain lock / Pomodoro / Feynman) and start/stop a session.
- Show a live countdown (computed from `endTime` vs `Date.now()`, not a local ticking interval owned by the popup).
- For Feynman technique: link/open a simple notes UI (can be part of popup or its own page) with the four-step prompt structure (explain simply, identify gaps, review, simplify again).

### options.js responsibilities
- Add/remove domains from `blocklist` in storage.
- No session logic — purely blocklist management.

### blocked.html
- Static page shown when `declarativeNetRequest` redirects a blocked navigation.
- Should show remaining session time (read from storage) and maybe a motivational message.

## Study Techniques (v1 scope)
- **Pomodoro**: configurable work/break intervals, auto-cycles using alarms, locks domains during work phases only.
- **Feynman technique**: guided notes template (four prompts), stored per-session in `chrome.storage.local`, no timer/lock requirement — can optionally run alongside a plain lock session.
- **Plain lock**: just a domain lock for a user-chosen duration, no technique attached.

## Key Implementation Notes
- Domain blocking is **domain-based, not tab-based** — this avoids needing to track individual tab objects, and naturally supports "multiple tabs of the same allowed domain stay open."
- All timing must be alarm-driven, not interval-driven, due to MV3 service worker lifecycle.
- Popup is a *view* of `chrome.storage.local` state, not the owner of it — it can close/reopen mid-session without breaking anything.

## Out of Scope for v1
- Cross-device sync of blocklist/settings.
- Additional study techniques beyond Pomodoro and Feynman.
- Analytics/session history dashboard.
- Promotional Website to promote to users for demo use once were finished.