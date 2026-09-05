import "../shared/base.css";
import "./parent.css";
import { KID_LIST, BOTH_KID } from "../shared/kids.js";
import { api } from "../shared/api.js";
import { DAYPARTS } from "../shared/dayparts.js";
import { startOfWeekIso, upcomingDays } from "../shared/days.js";

const TODAY_ISO = upcomingDays(1)[0].iso;

const WEEKDAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

const app = document.getElementById("app");

const TODAY_CODE = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

let chores = [];
let rewards = [];
let stars = null;
let allCompletions = [];
let google = { connected: false, calendars: [], selectedIds: [] };
let notice = null;
let busy = false;
let googleOpen = false;
let bulkOpen = false;
let selectedChoreDay = TODAY_CODE;
let selectedKidFilter = "both";
let draggedChoreId = null;

function kidFor(id) {
  if (id === "both") return BOTH_KID;
  return KID_LIST.find((k) => k.id === id);
}

function targetKidValue(kidIds) {
  return kidIds.length > 1 ? "both" : kidIds[0];
}

/** Runs a write action; on 401 (session missing/expired) drops back to the login screen. */
async function guarded(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
  } catch (err) {
    if (err.status === 401) {
      renderLogin("Session expired — please log in again.");
    } else {
      notice = { ok: false, text: err.message };
      render();
    }
  } finally {
    busy = false;
  }
}

function renderLogin(message = "") {
  app.innerHTML = `
    <div class="login">
      <h1>Parent login</h1>
      ${message ? `<p class="notice notice--error">${message}</p>` : ""}
      <form id="login-form">
        <input name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" autofocus />
        <button type="submit" class="btn btn--primary">Log in</button>
      </form>
    </div>
  `;

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = new FormData(e.target).get("pin");
    try {
      await api.post("/auth", { pin });
      await loadAll();
      render();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

async function loadAll() {
  [chores, rewards, stars, google, allCompletions] = await Promise.all([
    api.get("/chores"),
    api.get("/rewards"),
    api.get("/stars"),
    api.get("/google-calendars"),
    api.get("/completions"),
  ]);
}

async function refresh() {
  await loadAll();
  render();
}

function choreRow(chore) {
  const kid = kidFor(chore.kid);
  return `
    <li class="row" draggable="true" data-chore-id="${chore.id}" data-daypart="${chore.timeOfDay || "anytime"}">
      <span class="row__drag" aria-hidden="true">⠿</span>
      <span class="row__icon">${chore.icon}</span>
      <span class="row__title">${chore.title}</span>
      <span class="row__kid" style="--kid-color:${kid?.color}">${kid?.avatar ?? ""} ${kid?.displayName ?? chore.kid}</span>
      <span class="row__days">${chore.days.map((d) => d.toUpperCase()).join(" ")}</span>
      <span class="row__stars">${chore.starValue}⭐</span>
      <span class="row__spacer"></span>
      <span class="row__actions">
        <button class="btn btn--small" data-duplicate-chore="${chore.id}" aria-label="Duplicate to-do" title="Duplicate">⧉</button>
        <button class="btn btn--danger btn--small" data-delete-chore="${chore.id}" aria-label="Delete to-do">✕</button>
      </span>
    </li>
  `;
}

function kidFilterTabsHtml() {
  const tabs = [{ id: "both", avatar: "👨‍👩‍👧‍👦", displayName: "Both", color: "var(--accent)" }, ...KID_LIST];
  return tabs
    .map(
      (k) => `
      <button type="button" class="kid-tab${selectedKidFilter === k.id ? " is-selected" : ""}" data-kid-filter="${k.id}" style="--kid-color:${k.color}">${k.avatar} ${k.displayName}</button>
    `,
    )
    .join("");
}

function choreDayTabsHtml() {
  return WEEKDAYS.map(
    ([code, label]) => `
      <button type="button" class="day-tab${code === selectedChoreDay ? " is-selected" : ""}${code === TODAY_CODE ? " is-today" : ""}" data-chore-day="${code}">${label}</button>
    `,
  ).join("");
}

function visibleChores() {
  return chores.filter(
    (c) =>
      c.days.includes(selectedChoreDay) &&
      (selectedKidFilter === "both" || c.kid === selectedKidFilter || c.kid === "both"),
  );
}

function choreGroupsHtml() {
  const visible = visibleChores();
  return DAYPARTS.map((daypart) => {
    const items = visible
      .filter((c) => (c.timeOfDay || "anytime") === daypart.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return `
      <div class="chore-daypart">
        <div class="chore-daypart__heading">${daypart.icon} ${daypart.label}</div>
        <ul class="list chore-daypart__list" data-daypart="${daypart.id}">
          ${items.map(choreRow).join("") || `<li class="empty empty--small">Nothing yet</li>`}
        </ul>
        <form class="form quick-add" data-quick-add-daypart="${daypart.id}">
          <input name="title" type="text" placeholder="Add to-do…" required />
          <input name="starValue" type="number" min="1" value="1" title="Stars" />
          <input name="icon" type="text" placeholder="icon" />
          <button type="submit" class="btn btn--small btn--primary">Add</button>
        </form>
      </div>
    `;
  }).join("");
}

function bulkFormHtml() {
  return `
    <form id="chore-form" class="form">
      <input name="title" type="text" placeholder="To-do title" required />
      <div class="form__kids">
        ${KID_LIST.map(
          (k) =>
            `<label class="day-check"><input type="checkbox" name="kids" value="${k.id}" checked /> ${k.avatar} ${k.displayName}</label>`,
        ).join("")}
      </div>
      <select name="timeOfDay" title="Time of day">
        ${DAYPARTS.map((d) => `<option value="${d.id}">${d.icon} ${d.label}</option>`).join("")}
      </select>
      <input name="starValue" type="number" min="1" value="1" title="Stars" />
      <input name="icon" type="text" placeholder="icon" />
      <div class="form__days">
        ${WEEKDAYS.map(
          ([code, label]) =>
            `<label class="day-check"><input type="checkbox" name="days" value="${code}" /> ${label}</label>`,
        ).join("")}
      </div>
      <div class="form__day-presets">
        <button type="button" class="btn btn--ghost btn--small" data-day-preset="everyday">Every day</button>
        <button type="button" class="btn btn--ghost btn--small" data-day-preset="weekdays">Weekdays</button>
        <button type="button" class="btn btn--ghost btn--small" data-day-preset="clear">None</button>
      </div>
      <button type="submit" class="btn btn--primary">Add to-do</button>
    </form>
  `;
}

/** Total stars achievable in a week if every scheduled chore is completed every day it's assigned. */
function maxWeeklyStars() {
  return chores.reduce((sum, c) => sum + c.starValue * c.days.length * (c.kid === "both" ? 2 : 1), 0);
}

/** Combined (both-kid) star totals for every past week that has completions, most recent first. Excludes the current, still-in-progress week. */
function pastWeeklyTotals() {
  const totals = new Map();
  for (const c of allCompletions) {
    const week = startOfWeekIso(new Date(c.date));
    totals.set(week, (totals.get(week) ?? 0) + c.starValue);
  }
  totals.delete(startOfWeekIso());
  return [...totals.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
}

function rewardsSortedByCost() {
  return [...rewards].sort((a, b) => a.starCost - b.starCost);
}

/** Difficulty read-out for a reward's cost: how big a bite it takes out of a perfect week, and how often the team actually earned enough for it historically. */
function rewardEconomyText(reward) {
  const maxWeekly = maxWeeklyStars();
  const pct = maxWeekly ? Math.round((reward.starCost / maxWeekly) * 100) : 0;
  const history = pastWeeklyTotals();
  if (!history.length) return `${pct}% of a perfect week`;
  const hits = history.filter(([, total]) => total >= reward.starCost).length;
  return `${pct}% of a perfect week · hit ${hits}/${history.length} past week${history.length === 1 ? "" : "s"}`;
}

function rewardRow(reward) {
  return `
    <li class="row" data-reward-id="${reward.id}">
      <span class="row__title">${reward.title}<br /><small class="row__econ">${rewardEconomyText(reward)}</small></span>
      <span class="row__stars">${reward.starCost}⭐</span>
      <span class="row__status${reward.active ? " is-active" : ""}">${reward.active ? "Active" : "Inactive"}</span>
      <span class="row__spacer"></span>
      <span class="row__actions">
        <button class="btn btn--small" data-toggle-reward="${reward.id}">${reward.active ? "Deactivate" : "Activate"}</button>
        <button class="btn btn--small" data-redeem-reward="${reward.id}">Redeem</button>
        <button class="btn btn--danger btn--small" data-delete-reward="${reward.id}" aria-label="Delete reward">✕</button>
      </span>
    </li>
  `;
}

function starsHtml() {
  return `
    <div class="stars-row">
      ${KID_LIST.map(
        (k) => `
        <div class="stars-chip" style="--kid-color:${k.color}">
          <span class="stars-chip__label"><span class="stars-chip__dot"></span>${k.avatar} ${k.displayName}</span>
          <span class="stars-chip__value">${stars.lifetime[k.id] ?? 0}⭐</span>
        </div>
      `,
      ).join("")}
      <div class="stars-chip">
        <span class="stars-chip__label"><span class="stars-chip__dot"></span>👨 Dad</span>
        <span class="stars-chip__value">${stars.parentAwarded}⭐</span>
        <span class="stars-chip__sub">awarded to the kids</span>
      </div>
      <div class="stars-chip stars-chip--pool">
        <span class="stars-chip__label">Team pool</span>
        <span class="stars-chip__value">${stars.joint.available}⭐</span>
        <span class="stars-chip__sub">earned ${stars.joint.earned} · spent ${stars.joint.spent}</span>
      </div>
    </div>
  `;
}

function parentStarsHtml() {
  return `
    <div class="parent-stars">
      <form id="add-stars-form" class="form">
        <input name="amount" type="number" min="1" value="5" title="Stars to award" />
        <button type="submit" class="btn btn--small btn--primary">Add stars</button>
      </form>
      <button type="button" id="remove-parent-stars" class="btn btn--small btn--danger">Remove awarded stars</button>
      <button type="button" id="reset-pool" class="btn btn--small btn--danger">Reset pool to 0</button>
    </div>
  `;
}

function googleHtml() {
  if (!google.connected) {
    return `<a href="/api/google-oauth-start"><button type="button" class="btn btn--primary">Connect Google Calendar</button></a>`;
  }
  return `
    <p class="card__hint">Pick which calendars show on the kiosk:</p>
    <form id="calendars-form" class="cal-list">
      ${google.calendars
        .map(
          (c) => `
        <label class="cal-check">
          <input type="checkbox" name="calendarIds" value="${c.id}" ${
            google.selectedIds.includes(c.id) ? "checked" : ""
          } />
          ${c.summary}${c.primary ? " (primary)" : ""}
        </label>
      `,
        )
        .join("")}
      <div class="cal-actions">
        <button type="submit" class="btn btn--primary btn--small">Save selection</button>
        <button type="button" id="google-sync-now" class="btn btn--small">Sync now</button>
        <button type="button" id="google-disconnect" class="btn btn--danger btn--small">Disconnect</button>
      </div>
    </form>
  `;
}

function render() {
  app.innerHTML = `
    <div class="parent">
      <div class="parent__header">
        <h1>Parent panel</h1>
        <button id="logout" class="btn btn--ghost">Log out</button>
      </div>

      ${notice ? `<p class="notice ${notice.ok ? "notice--ok" : "notice--error"}">${notice.text}</p>` : ""}

      <section class="card">
        <div class="card__header"><h2>Stars</h2></div>
        ${starsHtml()}
        <p class="card__hint">Award bonus stars for anything outside the chore list — they count just like chore stars toward rewards.</p>
        ${parentStarsHtml()}
      </section>

      <section class="card">
        <button type="button" class="card__header card__header--toggle" id="google-toggle">
          <h2>Google Calendar</h2>
          <span class="card__toggle-icon">${googleOpen ? "▾" : "▸"}</span>
        </button>
        ${googleOpen ? googleHtml() : ""}
      </section>

      <section class="card">
        <div class="card__header">
          <h2>To-dos</h2>
          ${chores.length ? `<button type="button" class="btn btn--danger btn--small" id="clear-chores">Clear all</button>` : ""}
        </div>

        <div class="kid-tabs" id="kid-filter-tabs">${kidFilterTabsHtml()}</div>
        <div class="day-tabs" id="chore-day-tabs">${choreDayTabsHtml()}</div>

        <div id="chore-groups">${choreGroupsHtml()}</div>

        <div class="bulk-add">
          <button type="button" class="card__header card__header--toggle" id="bulk-toggle">
            <h3>Bulk add (same to-do on multiple days)</h3>
            <span class="card__toggle-icon">${bulkOpen ? "▾" : "▸"}</span>
          </button>
          ${bulkOpen ? bulkFormHtml() : ""}
        </div>
      </section>

      <section class="card">
        <div class="card__header"><h2>Rewards</h2></div>
        <p class="card__hint">Combined weekly stars from both kids unlock every reward they reach — hitting a big one doesn't spend down a smaller one. A perfect week is ${maxWeeklyStars()}⭐.</p>
        <ul class="list" id="reward-list">
          ${rewardsSortedByCost()
            .map((r) => rewardRow(r))
            .join("") || `<li class="empty">No rewards yet</li>`}
        </ul>
        <form id="reward-form" class="form">
          <input name="title" type="text" placeholder="Reward title" required />
          <input name="starCost" type="number" min="1" placeholder="Cost" required />
          <button type="submit" class="btn btn--primary">Add reward</button>
        </form>
      </section>
    </div>
  `;

  document.getElementById("google-toggle").addEventListener("click", () => {
    googleOpen = !googleOpen;
    render();
  });

  document.getElementById("logout").addEventListener("click", async () => {
    await api.del("/auth");
    renderLogin();
  });

  document.getElementById("add-stars-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    guarded(async () => {
      await api.post("/parent-stars", { amount: Number(form.get("amount")), date: TODAY_ISO });
      await refresh();
    });
  });

  document.getElementById("remove-parent-stars").addEventListener("click", () => {
    if (!confirm("Remove all parent-awarded stars? Real chore stars are untouched.")) return;
    guarded(async () => {
      await api.del("/parent-stars");
      await refresh();
    });
  });

  document.getElementById("reset-pool").addEventListener("click", () => {
    if (!confirm("Clear every reward redemption? This zeroes out what's been spent — lifetime chore/awarded stars are untouched.")) return;
    guarded(async () => {
      await api.del("/redemptions");
      await refresh();
    });
  });

  document.getElementById("calendars-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const calendarIds = new FormData(e.target).getAll("calendarIds");
    guarded(async () => {
      await api.post("/google-calendars", { calendarIds });
      notice = { ok: true, text: "Calendar selection saved." };
      await refresh();
    });
  });

  document.getElementById("google-sync-now")?.addEventListener("click", () => {
    guarded(async () => {
      const result = await api.post("/sync-calendar", {});
      notice = result.synced
        ? { ok: true, text: `Synced ${result.events.length} events.` }
        : { ok: false, text: `Sync skipped: ${result.reason}` };
      render();
    });
  });

  document.getElementById("google-disconnect")?.addEventListener("click", () => {
    if (!confirm("Disconnect Google Calendar?")) return;
    guarded(async () => {
      await api.del("/google-calendars");
      notice = { ok: true, text: "Disconnected." };
      await refresh();
    });
  });

  document.getElementById("clear-chores")?.addEventListener("click", () => {
    if (!confirm(`Delete all ${chores.length} to-do${chores.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    guarded(async () => {
      for (const c of chores) {
        await api.del(`/chores?id=${c.id}`);
      }
      await refresh();
    });
  });

  document.getElementById("kid-filter-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kid-filter]");
    if (!btn) return;
    selectedKidFilter = btn.dataset.kidFilter;
    render();
  });

  document.getElementById("chore-day-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chore-day]");
    if (!btn) return;
    selectedChoreDay = btn.dataset.choreDay;
    render();
  });

  document.getElementById("bulk-toggle").addEventListener("click", () => {
    bulkOpen = !bulkOpen;
    render();
  });

  function kidsForQuickAdd() {
    return selectedKidFilter === "both" ? KID_LIST.map((k) => k.id) : [selectedKidFilter];
  }

  document.querySelectorAll("[data-quick-add-daypart]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const daypart = form.dataset.quickAddDaypart;
      guarded(async () => {
        await api.post("/chores", {
          title: data.get("title"),
          kid: targetKidValue(kidsForQuickAdd()),
          days: [selectedChoreDay],
          starValue: Number(data.get("starValue")),
          icon: data.get("icon") || undefined,
          timeOfDay: daypart,
        });
        notice = null;
        await refresh();
      });
    });
  });

  function choresInDaypartGroup(daypart) {
    return visibleChores()
      .filter((c) => (c.timeOfDay || "anytime") === daypart)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  app.querySelectorAll("[data-duplicate-chore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const original = chores.find((c) => c.id === btn.dataset.duplicateChore);
      if (!original) return;
      guarded(async () => {
        const daypart = original.timeOfDay || "anytime";
        const group = choresInDaypartGroup(daypart);
        const idx = group.findIndex((c) => c.id === original.id);
        const base = original.order ?? 0;
        const next = idx !== -1 ? group[idx + 1] : undefined;
        const order = next ? (base + (next.order ?? base + 20)) / 2 : base + 10;
        await api.post("/chores", {
          title: original.title,
          kid: original.kid,
          days: original.days,
          starValue: original.starValue,
          icon: original.icon,
          timeOfDay: original.timeOfDay,
          order,
        });
        await refresh();
      });
    });
  });

  /** Moves chore `sourceId` into `targetDaypart`, positioned just before `beforeChoreId` (or at the end if omitted). */
  function moveChore(sourceId, targetDaypart, beforeChoreId) {
    const source = chores.find((c) => c.id === sourceId);
    if (!source) return;
    const daypartChanged = (source.timeOfDay || "anytime") !== targetDaypart;
    source.timeOfDay = targetDaypart;

    const group = choresInDaypartGroup(targetDaypart).filter((c) => c.id !== sourceId);
    const insertAt = beforeChoreId ? group.findIndex((c) => c.id === beforeChoreId) : -1;
    group.splice(insertAt === -1 ? group.length : insertAt, 0, source);
    group.forEach((c, i) => {
      c.order = (i + 1) * 10;
    });

    render();
    guarded(async () => {
      for (const c of group) {
        const patch = { id: c.id, order: c.order };
        if (c.id === sourceId && daypartChanged) patch.timeOfDay = targetDaypart;
        await api.patch("/chores", patch);
      }
      await refresh();
    });
  }

  app.querySelectorAll("#chore-groups .chore-daypart__list").forEach((list) => {
    list.addEventListener("dragover", (e) => {
      e.preventDefault();
      list.classList.add("is-drop-target");
    });
    list.addEventListener("dragleave", () => {
      list.classList.remove("is-drop-target");
    });
    list.addEventListener("drop", (e) => {
      e.preventDefault();
      list.classList.remove("is-drop-target");
      const sourceId = draggedChoreId;
      if (!sourceId) return;
      moveChore(sourceId, list.dataset.daypart, null);
    });
  });

  app.querySelectorAll("#chore-groups .row[draggable]").forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedChoreId = row.dataset.choreId;
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      draggedChoreId = null;
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = row.dataset.choreId;
      const sourceId = draggedChoreId;
      if (!sourceId || sourceId === targetId) return;
      moveChore(sourceId, row.dataset.daypart, targetId);
    });
  });

  const WEEKDAY_PRESETS = {
    everyday: WEEKDAYS.map(([code]) => code),
    weekdays: ["mon", "tue", "wed", "thu", "fri"],
    clear: [],
  };

  document.querySelectorAll("[data-day-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = WEEKDAY_PRESETS[btn.dataset.dayPreset];
      document.querySelectorAll('#chore-form input[name="days"]').forEach((box) => {
        box.checked = preset.includes(box.value);
      });
    });
  });

  document.getElementById("chore-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const days = form.getAll("days");
    const kids = form.getAll("kids");
    if (days.length === 0) {
      notice = { ok: false, text: "Pick at least one day for the chore." };
      render();
      return;
    }
    if (kids.length === 0) {
      notice = { ok: false, text: "Pick at least one kid for the chore." };
      render();
      return;
    }
    guarded(async () => {
      await api.post("/chores", {
        title: form.get("title"),
        kid: targetKidValue(kids),
        days,
        starValue: Number(form.get("starValue")),
        icon: form.get("icon") || undefined,
        timeOfDay: form.get("timeOfDay") || "anytime",
      });
      notice = null;
      await refresh();
    });
  });

  document.getElementById("reward-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    guarded(async () => {
      await api.post("/rewards", {
        title: form.get("title"),
        starCost: Number(form.get("starCost")),
      });
      notice = null;
      await refresh();
    });
  });

  app.querySelectorAll("[data-delete-chore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chore = chores.find((c) => c.id === btn.dataset.deleteChore);
      if (!confirm(`Delete "${chore?.title ?? "this to-do"}"?`)) return;
      guarded(async () => {
        await api.del(`/chores?id=${btn.dataset.deleteChore}`);
        await refresh();
      });
    });
  });

  app.querySelectorAll("[data-toggle-reward]").forEach((btn) => {
    btn.addEventListener("click", () => {
      guarded(async () => {
        const reward = rewards.find((r) => r.id === btn.dataset.toggleReward);
        await api.patch("/rewards", { id: reward.id, active: !reward.active });
        await refresh();
      });
    });
  });

  app.querySelectorAll("[data-delete-reward]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reward = rewards.find((r) => r.id === btn.dataset.deleteReward);
      if (!confirm(`Delete "${reward?.title ?? "this reward"}"?`)) return;
      guarded(async () => {
        await api.del(`/rewards?id=${btn.dataset.deleteReward}`);
        await refresh();
      });
    });
  });

  app.querySelectorAll("[data-redeem-reward]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reward = rewards.find((r) => r.id === btn.dataset.redeemReward);
      if (!confirm(`Redeem "${reward?.title ?? "this reward"}" for ${reward?.starCost ?? "?"}⭐?`)) return;
      guarded(async () => {
        await api.post("/redemptions", { rewardId: btn.dataset.redeemReward });
        await refresh();
      });
    });
  });
}

function consumeGoogleRedirectNotice() {
  const params = new URLSearchParams(window.location.search);
  const google = params.get("google");
  if (!google) return;
  notice =
    google === "connected"
      ? { ok: true, text: "Google Calendar connected." }
      : { ok: false, text: params.get("message") || "Google Calendar connection failed." };
  googleOpen = true;
  window.history.replaceState({}, "", window.location.pathname);
}

async function init() {
  app.innerHTML = `<div class="loading">Loading…</div>`;
  consumeGoogleRedirectNotice();
  const { authenticated } = await api.get("/auth");
  if (!authenticated) {
    renderLogin();
    return;
  }
  await loadAll();
  render();
}

init();
