import "../shared/base.css";
import "./home.css";
import { KID_LIST } from "../shared/kids.js";
import { api } from "../shared/api.js";

const app = document.getElementById("app");
let refreshing = false;

function renderClock(el) {
  const update = () => {
    el.textContent = new Date().toLocaleString(undefined, {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  update();
  setInterval(update, 30_000);
}

async function loadData() {
  const [stars, rewards, calendar] = await Promise.all([
    api.get("/stars"),
    api.get("/rewards"),
    api.get("/calendar"),
  ]);
  const activeReward = rewards.find((r) => r.active);
  return { stars, activeReward, calendar };
}

function formatEventTime(event) {
  if (event.allDay) return "All day";
  return new Date(event.start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function calendarHtml(calendar) {
  if (!calendar.events.length) {
    return `<div class="home__calendar-empty">Nothing on the calendar yet</div>`;
  }
  return `
    <ul class="home__calendar-list">
      ${calendar.events
        .slice(0, 6)
        .map(
          (e, i) => `
        <li class="home__calendar-item home__calendar-item--${i % 4}" style="--evt: ${e.color}">
          <span class="home__calendar-item-time">${formatEventTime(e)}</span>
          <span class="home__calendar-item-title">${e.title}</span>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

async function render() {
  const { stars, activeReward, calendar } = await loadData();

  app.innerHTML = `
    <div class="home">
      <div class="home__header">
        <h1>Family Hub</h1>
        <div class="home__clock" id="clock"></div>
      </div>

      <div class="home__calendar">
        <div class="home__calendar-header">
          <span>Upcoming</span>
          <button id="calendar-refresh">${refreshing ? "Syncing…" : "↻ Refresh"}</button>
        </div>
        ${calendarHtml(calendar)}
      </div>

      <div class="home__rewards">
        <div class="home__rewards-label">
          <span>${activeReward ? activeReward.title : "No reward set yet"}</span>
          <span>${stars.joint.available} / ${activeReward ? activeReward.starCost : 0} ⭐</span>
        </div>
        <div class="home__rewards-track">
          <div class="home__rewards-fill" style="width: ${
            activeReward
              ? Math.min(100, (stars.joint.available / activeReward.starCost) * 100)
              : 0
          }%"></div>
        </div>
      </div>

      <div class="home__kids" id="kid-tiles"></div>
    </div>
  `;

  renderClock(document.getElementById("clock"));

  document.getElementById("calendar-refresh").addEventListener("click", async () => {
    refreshing = true;
    render();
    try {
      await api.post("/sync-calendar", {});
    } finally {
      refreshing = false;
      render();
    }
  });

  const tiles = document.getElementById("kid-tiles");
  for (const kid of KID_LIST) {
    const tile = document.createElement("button");
    tile.className = "kid-tile";
    tile.style.background = kid.color;
    tile.innerHTML = `
      <span class="kid-tile__avatar">${kid.avatar}</span>
      <span>${kid.displayName}</span>
      <span class="kid-tile__stars">${stars.lifetime[kid.id] ?? 0} ⭐</span>
    `;
    tile.addEventListener("click", () => {
      window.location.href = `/kid.html?id=${kid.id}`;
    });
    tiles.appendChild(tile);
  }
}

render();
