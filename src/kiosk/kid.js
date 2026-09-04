import "../shared/base.css";
import "./kid.css";
import { KIDS } from "../shared/kids.js";
import { upcomingDays } from "../shared/days.js";

const app = document.getElementById("app");
const params = new URLSearchParams(window.location.search);
const kid = KIDS[params.get("id")] ?? KIDS.jack;

const days = upcomingDays(7);
let selectedIso = days[0].iso;

function render() {
  app.innerHTML = `
    <div class="kidpage" style="--kid-color: ${kid.color}">
      <div class="kidpage__header">
        <button class="kidpage__back" id="back">←</button>
        <div class="kidpage__title">${kid.avatar} ${kid.displayName}</div>
        <div class="kidpage__stars">-- ⭐</div>
      </div>

      <div class="daynav" id="daynav"></div>

      <div class="chores" id="chores">
        <div class="chores__empty">Chores coming soon</div>
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
}

render();
