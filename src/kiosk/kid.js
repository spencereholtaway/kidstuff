import "../shared/base.css";
import "./kid.css";
import { KIDS } from "../shared/kids.js";
import { upcomingDays } from "../shared/days.js";
import { api } from "../shared/api.js";

const app = document.getElementById("app");
const params = new URLSearchParams(window.location.search);
const kid = KIDS[params.get("id")] ?? KIDS.jack;

const days = upcomingDays(7);
let selectedIso = days[0].iso;

let chores = [];
let completions = [];
let lifetimeStars = 0;

async function loadData() {
  const [choresRes, completionsRes, starsRes] = await Promise.all([
    api.get("/chores"),
    api.get(`/completions?kid=${kid.id}&from=${days[0].iso}&to=${days[days.length - 1].iso}`),
    api.get("/stars"),
  ]);
  chores = choresRes.filter((c) => c.kid === kid.id);
  completions = completionsRes;
  lifetimeStars = starsRes.lifetime[kid.id] ?? 0;
}

function isDone(choreId, iso) {
  return completions.some((c) => c.choreId === choreId && c.date === iso);
}

async function toggleChore(choreId) {
  const optimistic = !isDone(choreId, selectedIso);
  await api.post("/completions", { choreId, kid: kid.id, date: selectedIso });
  await loadData();
  render();
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

      <div class="daynav" id="daynav"></div>

      <div class="chores" id="chores">
        ${
          choresForDay.length === 0
            ? `<div class="chores__empty">No chores for this day</div>`
            : ""
        }
      </div>
    </div>
  `;

  document.getElementById("back").addEventListener("click", () => {
    window.location.href = "/";
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
  for (const chore of choresForDay) {
    const done = isDone(chore.id, selectedIso);
    const item = document.createElement("button");
    item.className = "chore-item" + (done ? " is-done" : "");
    item.innerHTML = `
      <span class="chore-item__icon">${chore.icon}</span>
      <span class="chore-item__title">${chore.title}</span>
      <span class="chore-item__stars">${chore.starValue}⭐</span>
      <span class="chore-item__check">${done ? "✓" : ""}</span>
    `;
    item.addEventListener("click", () => toggleChore(chore.id));
    choresEl.appendChild(item);
  }
}

async function init() {
  app.innerHTML = `<div class="kidpage">Loading…</div>`;
  await loadData();
  render();
}

init();
