import "../shared/base.css";
import "./parent.css";
import { KID_LIST, BOTH_KID } from "../shared/kids.js";
import { api } from "../shared/api.js";
import { DAYPARTS } from "../shared/dayparts.js";
import { startOfWeekIso, upcomingDays, isoDate, dayCodeFor } from "../shared/days.js";

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
let redemptions = [];
let google = { connected: false, calendars: [], selectedIds: [] };
let notice = null;
let busy = false;
let googleOpen = false;
let bulkOpen = false;
let selectedChoreDay = TODAY_CODE;
let selectedKidFilter = "both";
let draggedChoreId = null;
let activeTab = "panel";
let selectedStatsChoreId = null;

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
        <input name="pin" type="password" autocomplete="off" placeholder="PIN" autofocus />
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
  [chores, rewards, stars, google, allCompletions, redemptions] = await Promise.all([
    api.get("/chores"),
    api.get("/rewards"),
    api.get("/stars"),
    api.get("/google-calendars"),
    api.get("/completions"),
    api.get("/redemptions"),
  ]);
  if (selectedStatsChoreId === null && chores.length) selectedStatsChoreId = chores[0].id;
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
    <div class="stepper mobile-only">
      <button type="button" id="stars-minus" class="stepper__btn stepper__btn--minus" aria-label="Remove a star">−</button>
      <button type="button" id="stars-plus" class="stepper__btn stepper__btn--plus" aria-label="Add a star">+</button>
    </div>
    <form id="stars-amount-form" class="form desktop-only">
      <input name="amount" type="number" min="1" value="1" title="Amount" />
      <button type="submit" class="btn btn--small btn--primary">Add</button>
      <button type="button" id="stars-subtract" class="btn btn--small btn--danger">Subtract</button>
    </form>
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

/** This kid's own chore completions (excludes parent-awarded bonus stars, which aren't "did a chore"). */
function kidChoreCompletions(kidId) {
  return allCompletions.filter((c) => c.kid === kidId && c.source !== "parent");
}

function starsPerDayMap(kidId) {
  const map = new Map();
  for (const c of kidChoreCompletions(kidId)) {
    map.set(c.date, (map.get(c.date) ?? 0) + c.starValue);
  }
  return map;
}

/** Current streak (consecutive days up to today/yesterday with >=1 chore done) and the longest ever. */
function computeStreaks(kidId) {
  const dates = new Set(kidChoreCompletions(kidId).map((c) => c.date));

  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!dates.has(isoDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(isoDate(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    if (prev) {
      const expected = new Date(prev);
      expected.setDate(expected.getDate() + 1);
      run = isoDate(expected) === d ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return { current, longest };
}

function heatmapWeeks(kidId, weeks = 10) {
  const perDay = starsPerDayMap(kidId);
  const max = Math.max(1, ...perDay.values());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMonday = new Date(startOfWeekIso(today));
  startMonday.setDate(startMonday.getDate() - (weeks - 1) * 7);

  const weekCols = [];
  for (let w = 0; w < weeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(startMonday);
      date.setDate(date.getDate() + w * 7 + d);
      const iso = isoDate(date);
      week.push({ iso, stars: perDay.get(iso) ?? 0, isFuture: date > today });
    }
    weekCols.push(week);
  }
  return { weekCols, max };
}

function heatmapHtml(kid) {
  const { weekCols, max } = heatmapWeeks(kid.id, 10);
  const cells = weekCols
    .map((week) =>
      week
        .map((day) => {
          if (day.isFuture) return `<div class="heat-cell heat-cell--future"></div>`;
          const bg =
            day.stars === 0
              ? "var(--surface-alt)"
              : `color-mix(in srgb, var(--accent-strong) ${Math.round(25 + (day.stars / max) * 75)}%, var(--surface-alt))`;
          return `<div class="heat-cell" style="background:${bg}" title="${day.iso}: ${day.stars}⭐"></div>`;
        })
        .join(""),
    )
    .join("");
  return `
    <div class="heatmap-block">
      <div class="heatmap-block__label" style="--kid-color:${kid.color}"><span class="stars-chip__dot"></span>${kid.avatar} ${kid.displayName}</div>
      <div class="heatmap" style="grid-template-rows: repeat(7, 1fr)">${cells}</div>
    </div>
  `;
}

function personalBests() {
  return KID_LIST.map((kid) => {
    const streaks = computeStreaks(kid.id);
    const perDay = starsPerDayMap(kid.id);
    const bestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      kid,
      lifetime: stars.lifetime[kid.id] ?? 0,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      bestDayStars: bestDay?.[1] ?? 0,
    };
  });
}

function streaksAndBestsHtml() {
  return `
    <div class="bests-row">
      ${personalBests()
        .map(
          (b) => `
        <div class="stars-chip" style="--kid-color:${b.kid.color}">
          <span class="stars-chip__label"><span class="stars-chip__dot"></span>${b.kid.avatar} ${b.kid.displayName}</span>
          <span class="stars-chip__value">🔥 ${b.currentStreak}-day streak</span>
          <span class="stars-chip__sub">longest ${b.longestStreak} · best day ${b.bestDayStars}⭐ · lifetime ${b.lifetime}⭐</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

/** % of scheduled days actually completed per chore, over the trailing 30 days. */
function choreReliability() {
  const windowDays = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return chores
    .map((chore) => {
      const doneDates = new Set(allCompletions.filter((c) => c.choreId === chore.id).map((c) => c.date));
      let expected = 0;
      let done = 0;
      for (let i = 0; i < windowDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (!chore.days.includes(dayCodeFor(d))) continue;
        expected++;
        if (doneDates.has(isoDate(d))) done++;
      }
      const pct = expected ? Math.round((done / expected) * 100) : null;
      return { chore, done, expected, pct };
    })
    .filter((r) => r.expected > 0)
    .sort((a, b) => a.pct - b.pct);
}

function reliabilityHtml() {
  const rows = choreReliability();
  if (!rows.length) return `<p class="empty">Not enough history yet.</p>`;
  return `
    <ul class="reliability-list">
      ${rows
        .map(
          ({ chore, done, expected, pct }) => `
        <li class="reliability-row">
          <span class="reliability-row__title">${chore.icon ?? ""} ${chore.title}</span>
          <div class="reliability-row__bar"><div class="reliability-row__fill" style="width:${pct}%"></div></div>
          <span class="reliability-row__pct">${pct}% <span class="reliability-row__count">(${done}/${expected})</span></span>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function formatHour(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function statsChoreSelectHtml() {
  return `
    <select id="stats-chore-select" title="To-do">
      ${chores.map((c) => `<option value="${c.id}" ${c.id === selectedStatsChoreId ? "selected" : ""}>${c.icon ?? ""} ${c.title}</option>`).join("")}
    </select>
  `;
}

/** Scatter of what time of day a chore actually got done, per kid, over the trailing window. */
function timeOfDayChartHtml() {
  if (!chores.length) return `<p class="empty">No to-dos yet.</p>`;
  const chore = chores.find((c) => c.id === selectedStatsChoreId) ?? chores[0];

  const width = 640;
  const height = 220;
  const padding = { top: 10, right: 12, bottom: 24, left: 40 };
  const rangeDays = 45;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (rangeDays - 1));

  const xFor = (iso) => {
    const dayIdx = Math.round((new Date(iso) - startDate) / 86400000);
    return padding.left + (dayIdx / (rangeDays - 1)) * (width - padding.left - padding.right);
  };
  const yMin = 5;
  const yMax = 22;
  const yFor = (hour) => {
    const clamped = Math.min(Math.max(hour, yMin), yMax);
    return padding.top + (1 - (clamped - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom);
  };

  const gridLines = [6, 9, 12, 15, 18, 21]
    .map(
      (h) => `
    <line x1="${padding.left}" x2="${width - padding.right}" y1="${yFor(h)}" y2="${yFor(h)}" stroke="var(--surface-alt)" stroke-width="1" />
    <text x="${padding.left - 6}" y="${yFor(h) + 3}" text-anchor="end" font-size="10" fill="var(--text-faint)">${formatHour(h).replace(":00", "")}</text>
  `,
    )
    .join("");

  const points = allCompletions.filter((c) => c.choreId === chore.id && new Date(c.date) >= startDate);
  const dots = points
    .map((p) => {
      const kid = KID_LIST.find((k) => k.id === p.kid);
      if (!kid) return "";
      const dt = new Date(p.completedAt);
      const hour = dt.getHours() + dt.getMinutes() / 60;
      return `<circle cx="${xFor(p.date)}" cy="${yFor(hour)}" r="4" fill="${kid.color}"><title>${kid.displayName} · ${p.date} · ${formatHour(hour)}</title></circle>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="tod-chart" role="img" aria-label="Time of day ${chore.title} was completed, last ${rangeDays} days">
      ${gridLines}
      ${dots}
    </svg>
    <div class="tod-legend">
      ${KID_LIST.map((k) => `<span class="legend-item"><span class="legend-dot" style="background:${k.color}"></span>${k.avatar} ${k.displayName}</span>`).join("")}
    </div>
  `;
}

function redemptionFeedHtml() {
  if (!redemptions.length) return `<p class="empty">No redemptions yet.</p>`;
  const sorted = [...redemptions].sort((a, b) => (a.redeemedAt < b.redeemedAt ? 1 : -1)).slice(0, 12);
  return `
    <ul class="list">
      ${sorted
        .map((r) => {
          const kid = KID_LIST.find((k) => k.id === r.kid);
          const when = new Date(r.redeemedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return `
          <li class="row">
            <span class="row__title">${r.title}</span>
            <span class="row__kid">${kid ? `${kid.avatar} ${kid.displayName}` : "Team"}</span>
            <span class="row__spacer"></span>
            <span class="row__stars">${r.starsSpent}⭐</span>
            <span class="row__days">${when}</span>
          </li>
        `;
        })
        .join("")}
    </ul>
  `;
}

function statsHtml() {
  return `
      <section class="card">
        <div class="card__header"><h2>Streaks &amp; bests</h2></div>
        ${streaksAndBestsHtml()}
      </section>

      <section class="card">
        <div class="card__header"><h2>Consistency</h2></div>
        <div class="heatmaps">${KID_LIST.map(heatmapHtml).join("")}</div>
        <p class="card__hint">Darker = more stars earned that day.</p>
      </section>

      <section class="card">
        <div class="card__header"><h2>What time does it happen?</h2>${statsChoreSelectHtml()}</div>
        ${timeOfDayChartHtml()}
      </section>

      <section class="card">
        <div class="card__header"><h2>To-do reliability</h2></div>
        <p class="card__hint">Share of scheduled days actually completed, last 30 days.</p>
        ${reliabilityHtml()}
      </section>

      <section class="card">
        <div class="card__header"><h2>Recent redemptions</h2></div>
        ${redemptionFeedHtml()}
      </section>
  `;
}

function panelHtml() {
  return `
      <section class="card">
        <div class="card__header"><h2>Stars</h2></div>
        ${starsHtml()}
        ${parentStarsHtml()}
      </section>

      <section class="card desktop-only">
        <button type="button" class="card__header card__header--toggle" id="google-toggle">
          <h2>Google Calendar</h2>
          <span class="card__toggle-icon">${googleOpen ? "▾" : "▸"}</span>
        </button>
        ${googleOpen ? googleHtml() : ""}
      </section>

      <section class="card desktop-only">
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

      <section class="card desktop-only">
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

      <div class="tabs desktop-only" id="main-tabs">
        <button type="button" class="tab-btn${activeTab === "panel" ? " is-selected" : ""}" data-tab="panel">Panel</button>
        <button type="button" class="tab-btn${activeTab === "stats" ? " is-selected" : ""}" data-tab="stats">Stats</button>
      </div>

      ${activeTab === "stats" ? `<div class="tab-content desktop-only">${statsHtml()}</div>` : panelHtml()}
    </div>
  `;

  document.getElementById("main-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    render();
  });

  document.getElementById("stats-chore-select")?.addEventListener("change", (e) => {
    selectedStatsChoreId = e.target.value;
    render();
  });

  document.getElementById("google-toggle")?.addEventListener("click", () => {
    googleOpen = !googleOpen;
    render();
  });

  document.getElementById("logout").addEventListener("click", async () => {
    await api.del("/auth");
    renderLogin();
  });

  document.getElementById("stars-plus")?.addEventListener("click", () => {
    guarded(async () => {
      await api.post("/parent-stars", { amount: 1, date: TODAY_ISO });
      await refresh();
    });
  });

  document.getElementById("stars-minus")?.addEventListener("click", () => {
    guarded(async () => {
      await api.post("/parent-stars", { amount: -1, date: TODAY_ISO });
      await refresh();
    });
  });

  document.getElementById("stars-amount-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number(new FormData(e.target).get("amount"));
    guarded(async () => {
      await api.post("/parent-stars", { amount, date: TODAY_ISO });
      await refresh();
    });
  });

  document.getElementById("stars-subtract")?.addEventListener("click", () => {
    const form = document.getElementById("stars-amount-form");
    const amount = Number(new FormData(form).get("amount"));
    guarded(async () => {
      await api.post("/parent-stars", { amount: -amount, date: TODAY_ISO });
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

  document.getElementById("kid-filter-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-kid-filter]");
    if (!btn) return;
    selectedKidFilter = btn.dataset.kidFilter;
    render();
  });

  document.getElementById("chore-day-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chore-day]");
    if (!btn) return;
    selectedChoreDay = btn.dataset.choreDay;
    render();
  });

  document.getElementById("bulk-toggle")?.addEventListener("click", () => {
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

  document.getElementById("reward-form")?.addEventListener("submit", (e) => {
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
