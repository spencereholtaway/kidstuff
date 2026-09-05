import "../shared/base.css";
import "./home.css";
import { KID_LIST } from "../shared/kids.js";
import { api } from "../shared/api.js";
import { upcomingDays, isoDate, startOfWeekIso } from "../shared/days.js";
import { DAYPARTS } from "../shared/dayparts.js";
import { buildRewardTiers } from "../shared/rewardTiers.js";
import { ensureKioskUnlocked } from "../shared/kioskLock.js";

const app = document.getElementById("app");
let refreshing = false;

const days = upcomingDays(7);
const todayIso = days[0].iso;
const todayDayCode = days[0].dayCode;
let calendarScrollTop = 0;

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
  const [calendar, chores, weekCompletions, rewards, stars] = await Promise.all([
    api.get("/calendar"),
    api.get("/chores"),
    api.get(`/completions?from=${startOfWeekIso()}&to=${todayIso}`),
    api.get("/rewards"),
    api.get("/stars"),
  ]);
  const rewardTiers = buildRewardTiers(rewards, stars.joint.available);
  return { calendar, chores, weekCompletions, bankAvailable: stars.joint.available, rewardTiers };
}

function rewardTiersHtml(rewardTiers, bankAvailable) {
  if (!rewardTiers.length) {
    return `
      <div class="home__stars">
        <span>Stars saved up</span>
        <span class="home__stars-value">${bankAvailable} ⭐</span>
      </div>
    `;
  }
  return `
    <div class="home__rewards">
      ${rewardTiers
        .map(({ reward, unlocked, progress }) => {
          const pct = Math.min(100, Math.round((progress / reward.starCost) * 100));
          const status = unlocked
            ? `<button type="button" class="reward-tile__claim" data-claim-reward="${reward.id}">Claim!</button>`
            : `<span class="reward-tile__status">${reward.starCost - progress}⭐ to go</span>`;
          return `
          <div class="reward-tile${unlocked ? " is-unlocked" : ""}">
            <div class="reward-tile__head">
              <span class="reward-tile__title">${reward.title}</span>
              <span class="reward-tile__count">${progress}/${reward.starCost}⭐</span>
            </div>
            <div class="reward-tile__bar"><div class="reward-tile__fill" style="width:${pct}%"></div></div>
            ${status}
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function formatEventTime(event) {
  if (event.allDay) return "All day";
  return new Date(event.start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function calendarAgendaHtml(calendar) {
  return days
    .map((day) => {
      const events = calendar.events.filter((e) => isoDate(new Date(e.start)) === day.iso);
      const body = events.length
        ? `
          <ul class="home__calendar-list">
            ${events
              .map(
                (e) => `
              <li class="home__calendar-item">
                <span class="home__calendar-item-time">${formatEventTime(e)}</span>
                <span class="home__calendar-item-title">${e.title}</span>
              </li>
            `,
              )
              .join("")}
          </ul>
        `
        : `<div class="home__calendar-empty">Nothing planned</div>`;
      const weekday = day.date.toLocaleDateString(undefined, { weekday: "long" });
      const heading = day.label === "Today" ? `Today · ${weekday} · ${day.dateLabel}` : `${weekday} · ${day.dateLabel}`;
      return `
        <section class="home__calendar-daygroup" id="cal-day-${day.iso}" data-iso="${day.iso}">
          <div class="home__calendar-daygroup-heading">${heading}</div>
          ${body}
        </section>
      `;
    })
    .join("");
}

function calendarDaysHtml(activeIso) {
  return days
    .map(
      (day) => `
      <button class="home__calendar-day${day.iso === activeIso ? " is-selected" : ""}" data-iso="${day.iso}">
        <span class="home__calendar-day-num">${day.date.getDate()}</span>
        <span class="home__calendar-day-name">${day.label === "Today" ? "Today" : day.date.toLocaleDateString(undefined, { weekday: "long" })}</span>
      </button>
    `,
    )
    .join("");
}

/** Highlights whichever day pill corresponds to the agenda section nearest the top of the scroll view. */
function setupCalendarScrollspy() {
  const container = document.getElementById("calendar-list");
  const groups = Array.from(container.querySelectorAll(".home__calendar-daygroup"));

  const setActive = (iso) => {
    document.querySelectorAll(".home__calendar-day").forEach((pill) => {
      pill.classList.toggle("is-selected", pill.dataset.iso === iso);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.dataset.iso);
    },
    { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 },
  );
  groups.forEach((group) => observer.observe(group));
}

function isDone(completions, choreId, kidId) {
  return completions.some((c) => c.choreId === choreId && c.kid === kidId && c.date === todayIso);
}

const DAYPARTS_ANYTIME_FIRST = [
  DAYPARTS.find((d) => d.id === "anytime"),
  ...DAYPARTS.filter((d) => d.id !== "anytime"),
];

function chorePanelHtml(kid, choresToday, completions) {
  const items = choresToday.length
    ? DAYPARTS_ANYTIME_FIRST.map((daypart) => {
        const choresInPart = choresToday
          .filter((c) => (c.timeOfDay || "anytime") === daypart.id)
          .sort((a, b) => {
            const doneA = isDone(completions, a.id, kid.id) ? 1 : 0;
            const doneB = isDone(completions, b.id, kid.id) ? 1 : 0;
            if (doneA !== doneB) return doneA - doneB;
            return (a.order ?? 0) - (b.order ?? 0);
          });
        if (choresInPart.length === 0) return "";
        return `
          <div class="home__kidpanel-heading">${daypart.icon} ${daypart.label}</div>
          ${choresInPart
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
            .join("")}
        `;
      }).join("")
    : `<div class="home__panel-empty">No to-dos today</div>`;

  return `
    <div class="home__kidpanel" style="--kid-color:${kid.color}">
      <button class="home__kidpanel-header" data-kid-id="${kid.id}">
        <span class="home__kidpanel-avatar">${kid.avatar}</span>
        <span class="home__kidpanel-title">${kid.displayName}'s to-dos today</span>
      </button>
      <div class="home__kidpanel-list" data-kid-id="${kid.id}">${items}</div>
    </div>
  `;
}

/** Scrolls the given kid's panel so their first not-yet-done chore lands at the top. */
function scrollPanelToFirstUndone(kidId, behavior) {
  const list = document.querySelector(`.home__kidpanel-list[data-kid-id="${kidId}"]`);
  if (!list) return;
  const target = Array.from(list.querySelectorAll(".home-chore")).find((el) => !el.classList.contains("is-done"));
  if (!target) return;
  const delta = target.getBoundingClientRect().top - list.getBoundingClientRect().top;
  list.scrollTo({ top: list.scrollTop + delta, behavior });
}

async function render() {
  const { calendar, chores, weekCompletions, weeklyStars, rewardTiers } = await loadData();

  app.innerHTML = `
    <div class="home__orbs" aria-hidden="true">
      <span class="home__orb home__orb--a"></span>
      <span class="home__orb home__orb--b"></span>
      <span class="home__orb home__orb--c"></span>
      <span class="home__orb home__orb--d"></span>
      <span class="home__orb home__orb--e"></span>
    </div>
    <div class="home">
      <div class="home__header">
        <h1>Family Hub</h1>
        <div class="home__clock" id="clock"></div>
      </div>

      ${rewardTiersHtml(rewardTiers, weeklyStars)}

      <div class="home__body">
        <div class="home__calendar">
          <div class="home__calendar-days" id="calendar-days">${calendarDaysHtml(todayIso)}</div>
          <div class="home__calendar-header">
            <span>This week</span>
            <button id="calendar-refresh">${refreshing ? "Syncing…" : "↻ Refresh"}</button>
          </div>
          <div class="home__calendar-agenda" id="calendar-list">${calendarAgendaHtml(calendar)}</div>
        </div>

        <div class="home__kidcol">
          ${KID_LIST.map((kid) =>
            chorePanelHtml(
              kid,
              chores.filter((c) => (c.kid === kid.id || c.kid === "both") && c.days.includes(todayDayCode)),
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
    document.getElementById(`cal-day-${btn.dataset.iso}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const calendarList = document.getElementById("calendar-list");
  calendarList.scrollTop = calendarScrollTop;
  calendarList.addEventListener("scroll", () => {
    calendarScrollTop = calendarList.scrollTop;
  });
  setupCalendarScrollspy();

  app.querySelectorAll("[data-claim-reward]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api.post("/redemptions", { rewardId: btn.dataset.claimReward });
      } catch {
        // the bank moved (e.g. spent elsewhere) — re-render will reflect reality
      }
      await render();
    });
  });

  app.querySelectorAll(".home-chore").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { choreId, kidId } = btn.dataset;
      const wasDone = btn.classList.contains("is-done");
      await api.post("/completions", { choreId, kid: kidId, date: todayIso });
      await render();
      if (!wasDone) scrollPanelToFirstUndone(kidId, "smooth");
    });
  });

  app.querySelectorAll(".home__kidpanel-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `/kid.html?id=${btn.dataset.kidId}`;
    });
  });
}

ensureKioskUnlocked().then(render);
