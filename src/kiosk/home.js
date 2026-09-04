import "../shared/base.css";
import "./home.css";
import { KID_LIST } from "../shared/kids.js";
import { api } from "../shared/api.js";

const app = document.getElementById("app");

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
  const [stars, rewards] = await Promise.all([api.get("/stars"), api.get("/rewards")]);
  const activeReward = rewards.find((r) => r.active);
  return { stars, activeReward };
}

async function render() {
  const { stars, activeReward } = await loadData();

  app.innerHTML = `
    <div class="home">
      <div class="home__header">
        <h1>Family Hub</h1>
        <div class="home__clock" id="clock"></div>
      </div>

      <div class="home__calendar">Calendar coming soon</div>

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
