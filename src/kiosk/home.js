import "../shared/base.css";
import "./home.css";
import { KID_LIST } from "../shared/kids.js";
import { api } from "../shared/api.js";
import { upcomingDays, isoDate } from "../shared/days.js";

const app = document.getElementById("app");
let refreshing = false;
let selectedDayIso = null; // null = "Upcoming" view across all days

const days = upcomingDays(7);
const todayIso = days[0].iso;
const todayDayCode = days[0].dayCode;

function startOfWeekIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

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
  const [calendar, chores, weekCompletions] = await Promise.all([
    api.get("/calendar"),
    api.get("/chores"),
    api.get(`/completions?from=${startOfWeekIso()}&to=${todayIso}`),
  ]);
  const weeklyStars = weekCompletions.reduce((sum, c) => sum + c.starValue, 0);
  return { calendar, chores, weekCompletions, weeklyStars };
}

function formatEventTime(event) {
  if (event.allDay) return "All day";
  return new Date(event.start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function calendarListHtml(calendar) {
  const events = selectedDayIso
    ? calendar.events.filter((e) => isoDate(new Date(e.start)) === selectedDayIso)
    : calendar.events.slice(0, 6);

  if (!events.length) {
    return `<div class="home__calendar-empty">${
      selectedDayIso ? "Nothing that day" : "Nothing on the calendar yet"
    }</div>`;
  }
  return `
    <ul class="home__calendar-list">
      ${events
        .map(
          (e) => `
        <li class="home__calendar-item" style="border-left-color:${e.color}">
          <span class="home__calendar-item-time">${formatEventTime(e)}</span>
          <span class="home__calendar-item-title">${e.title}</span>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function calendarDaysHtml() {
  return days
    .map(
      (day) => `
      <button class="home__calendar-day${day.iso === selectedDayIso ? " is-selected" : ""}" data-iso="${day.iso}">
        <span class="home__calendar-day-num">${day.date.getDate()}</span>
        <span class="home__calendar-day-name">${day.label === "Today" ? "Today" : day.date.toLocaleDateString(undefined, { weekday: "long" })}</span>
      </button>
    `,
    )
    .join("");
}

function isDone(completions, choreId, kidId) {
  return completions.some((c) => c.choreId === choreId && c.kid === kidId && c.date === todayIso);
}

function chorePanelHtml(kid, choresToday, completions) {
  const items = choresToday.length
    ? choresToday
        .map((chore) => {
          const done = isDone(completions, chore.id, kid.id);
          return `
          <button class="home-chore${done ? " is-done" : ""}" data-chore-id="${chore.id}" data-kid-id="${kid.id}" style="--kid-color:${kid.color}">
            <span class="home-chore__icon">${chore.icon}</span>
            <span class="home-chore__title">${chore.title}</span>
            <span class="home-chore__stars">${chore.starValue}⭐</span>
            <span class="home-chore__check">${done ? "✓" : ""}</span>
          </button>
        `;
        })
        .join("")
    : `<div class="home__panel-empty">No chores today</div>`;

  return `
    <div class="home__kidpanel" style="--kid-color:${kid.color}">
      <button class="home__kidpanel-header" data-kid-id="${kid.id}">
        <span class="home__kidpanel-avatar">${kid.avatar}</span>
        <span class="home__kidpanel-title">${kid.displayName}'s chores today</span>
      </button>
      <div class="home__kidpanel-list">${items}</div>
    </div>
  `;
}

async function render() {
  const { calendar, chores, weekCompletions, weeklyStars } = await loadData();

  app.innerHTML = `
    <div class="home">
      <div class="home__header">
        <h1>Family Hub</h1>
        <div class="home__clock" id="clock"></div>
      </div>

      <div class="home__stars">
        <span>Stars so far this week</span>
        <span class="home__stars-value">${weeklyStars} ⭐</span>
      </div>

      <div class="home__body">
        <div class="home__calendar">
          <div class="home__calendar-days" id="calendar-days">${calendarDaysHtml()}</div>
          <div class="home__calendar-header">
            <span>${selectedDayIso ? days.find((d) => d.iso === selectedDayIso).label : "Upcoming"}</span>
            <button id="calendar-refresh">${refreshing ? "Syncing…" : "↻ Refresh"}</button>
          </div>
          <div id="calendar-list">${calendarListHtml(calendar)}</div>
        </div>

        <div class="home__kidcol">
          ${KID_LIST.map((kid) =>
            chorePanelHtml(
              kid,
              chores.filter((c) => c.kid === kid.id && c.days.includes(todayDayCode)),
              weekCompletions,
            ),
          ).join("")}
        </div>
      </div>
    </div>
  `;

  renderClock(document.getElementById("clock"));

  document.getElementById("calendar-refresh").addEventListener("click", async (e) => {
    e.stopPropagation();
    refreshing = true;
    render();
    try {
      await api.post("/sync-calendar", {});
    } finally {
      refreshing = false;
      render();
    }
  });

  document.getElementById("calendar-days").addEventListener("click", (e) => {
    const btn = e.target.closest(".home__calendar-day");
    if (!btn) return;
    const iso = btn.dataset.iso;
    selectedDayIso = selectedDayIso === iso ? null : iso;
    render();
  });

  app.querySelectorAll(".home-chore").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { choreId, kidId } = btn.dataset;
      await api.post("/completions", { choreId, kid: kidId, date: todayIso });
      render();
    });
  });

  app.querySelectorAll(".home__kidpanel-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `/kid.html?id=${btn.dataset.kidId}`;
    });
  });
}

render();
