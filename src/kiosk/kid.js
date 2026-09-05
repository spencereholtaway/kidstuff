import "../shared/base.css";
import "./kid.css";
import { KIDS } from "../shared/kids.js";
import { upcomingDays } from "../shared/days.js";
import { api } from "../shared/api.js";
import { DAYPARTS } from "../shared/dayparts.js";
import { buildRewardTiers } from "../shared/rewardTiers.js";
import { ensureKioskUnlocked } from "../shared/kioskLock.js";
import { flipSnapshot, flipAnimate } from "../shared/flip.js";

const app = document.getElementById("app");
const params = new URLSearchParams(window.location.search);
const kid = KIDS[params.get("id")] ?? KIDS.jack;

const days = upcomingDays(7);
const todayIso = days[0].iso;
let selectedIso = todayIso;
let hasAutoScrolled = false;

let chores = [];
let completions = [];
let lifetimeStars = 0;
let rewardTiers = [];

/**
 * Scrolls so the first not-yet-done chore lands at the top — everything already completed
 * scrolls out of view above it, since there's nothing left to do up there.
 */
function scrollToFirstUndone(behavior) {
  const container = document.querySelector(".chores");
  if (!container) return;
  const target = Array.from(container.querySelectorAll(".chore-item")).find(
    (el) => !el.classList.contains("is-done"),
  );
  if (!target) return;
  const delta = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTo({ top: container.scrollTop + delta, behavior });
}

async function loadData() {
  const [choresRes, completionsRes, starsRes, rewards] = await Promise.all([
    api.get("/chores"),
    api.get(`/completions?kid=${kid.id}&from=${days[0].iso}&to=${days[days.length - 1].iso}`),
    api.get("/stars"),
    api.get("/rewards"),
  ]);
  chores = choresRes.filter((c) => c.kid === kid.id || c.kid === "both");
  completions = completionsRes;
  lifetimeStars = starsRes.lifetime[kid.id] ?? 0;
  rewardTiers = buildRewardTiers(rewards, starsRes.joint.available);
}

function rewardTilesHtml() {
  if (!rewardTiers.length) return "";
  return `
    <div class="kidpage__rewards">
      ${rewardTiers
        .map(({ reward, unlocked, progress }) => {
          const teamPct = Math.min(100, Math.round((progress / reward.starCost) * 100));
          const minePct = Math.min(100, Math.round((lifetimeStars / reward.starCost) * 100));
          const status = unlocked
            ? `<button type="button" class="reward-tile__claim" data-claim-reward="${reward.id}">Claim!</button>`
            : `<span class="reward-tile__status">${reward.starCost - progress}⭐ to go</span>`;
          return `
          <div class="reward-tile${unlocked ? " is-unlocked" : ""}">
            <div class="reward-tile__head">
              <span class="reward-tile__title">${reward.title}</span>
              <span class="reward-tile__count">${progress}/${reward.starCost}⭐</span>
            </div>
            <div class="reward-tile__bar">
              <div class="reward-tile__fill" style="width:${teamPct}%"></div>
              <div class="reward-tile__fill-mine" style="width:${minePct}%"></div>
            </div>
            ${status}
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function isDone(choreId, iso) {
  return completions.some((c) => c.choreId === choreId && c.date === iso);
}

async function toggleChore(choreId) {
  const wasDone = isDone(choreId, selectedIso);
  const btn = document.querySelector(`.chore-item[data-chore-id="${choreId}"]`);
  btn?.classList.toggle("is-done"); // instant feedback while the request is in flight

  const container = document.querySelector(".chores");
  const snapshot = flipSnapshot(container, ".chore-item", (el) => el.dataset.choreId);

  await api.post("/completions", { choreId, kid: kid.id, date: selectedIso });
  await loadData();
  render();

  flipAnimate(document.querySelector(".chores"), ".chore-item", (el) => el.dataset.choreId, snapshot);
  if (!wasDone) scrollToFirstUndone("smooth");
}

function render() {
  const dayCode = days.find((d) => d.iso === selectedIso).dayCode;
  const choresForDay = chores.filter((c) => c.days.includes(dayCode));

  app.innerHTML = `
    <div class="kidpage" style="--kid-color: ${kid.color}">
      <div class="kidpage__header">
        <button class="kidpage__back" id="back">←</button>
        <div class="kidpage__title">${kid.avatar} ${kid.displayName}</div>
        <div class="kidpage__stars">${lifetimeStars} ⭐</div>
      </div>

      ${rewardTilesHtml()}

      <div class="daynav" id="daynav"></div>

      <div class="chores" id="chores">
        ${
          choresForDay.length === 0
            ? `<div class="chores__empty">No to-dos for this day</div>`
            : ""
        }
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => {
    window.location.href = "/";
  });

  app.querySelectorAll("[data-claim-reward]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api.post("/redemptions", { rewardId: btn.dataset.claimReward, kid: kid.id });
      } catch {
        // the bank moved (e.g. spent elsewhere) — re-render will reflect reality
      }
      await loadData();
      render();
    });
  });

  const nav = document.getElementById("daynav");
  for (const day of days) {
    const btn = document.createElement("button");
    btn.className = "daynav__day" + (day.iso === selectedIso ? " is-selected" : "");
    btn.innerHTML = `<span>${day.label}</span><span class="daynav__day-date">${day.dateLabel}</span>`;
    btn.addEventListener("click", () => {
      selectedIso = day.iso;
      render();
    });
    nav.appendChild(btn);
  }

  const choresEl = document.getElementById("chores");

  function appendChoreItem(container, chore) {
    const done = isDone(chore.id, selectedIso);
    const item = document.createElement("button");
    item.className = "chore-item" + (done ? " is-done" : "");
    item.dataset.choreId = chore.id;
    item.innerHTML = `
      <span class="chore-item__icon">${chore.icon}</span>
      <span class="chore-item__title">${chore.title}</span>
      <span class="chore-item__stars">${chore.starValue}⭐</span>
      <span class="chore-item__check"></span>
    `;
    item.addEventListener("click", () => toggleChore(chore.id));
    container.appendChild(item);
  }

  function choresIn(daypartId) {
    return choresForDay
      .filter((c) => (c.timeOfDay || "anytime") === daypartId)
      .sort((a, b) => {
        const doneA = isDone(a.id, selectedIso) ? 1 : 0;
        const doneB = isDone(b.id, selectedIso) ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        return (a.order ?? 0) - (b.order ?? 0);
      });
  }

  // "Anytime" is listed first, then the time-of-day groups in order.
  const anytimeFirst = [DAYPARTS.find((d) => d.id === "anytime"), ...DAYPARTS.filter((d) => d.id !== "anytime")];
  for (const daypart of anytimeFirst) {
    const choresInPart = choresIn(daypart.id);
    if (choresInPart.length === 0) continue;

    const heading = document.createElement("div");
    heading.className = "chores__heading";
    heading.dataset.daypart = daypart.id;
    heading.textContent = `${daypart.icon} ${daypart.label}`;
    choresEl.appendChild(heading);

    for (const chore of choresInPart) appendChoreItem(choresEl, chore);
  }

  // On first load, jump straight past whatever's already done today.
  if (!hasAutoScrolled && selectedIso === todayIso) {
    hasAutoScrolled = true;
    scrollToFirstUndone("auto");
  }
}

async function init() {
  await ensureKioskUnlocked();
  app.innerHTML = `<div class="kidpage">Loading…</div>`;
  await loadData();
  render();
}

init();
