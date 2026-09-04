import "../shared/base.css";
import { KID_LIST } from "../shared/kids.js";
import { api } from "../shared/api.js";

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
app.style.overflow = "auto";
app.style.height = "auto";
app.style.padding = "2rem";
app.style.fontFamily = "sans-serif";
app.style.maxWidth = "640px";
app.style.margin = "0 auto";

let chores = [];
let rewards = [];
let stars = null;

async function loadAll() {
  [chores, rewards, stars] = await Promise.all([
    api.get("/chores"),
    api.get("/rewards"),
    api.get("/stars"),
  ]);
}

async function refresh() {
  await loadAll();
  render();
}

function choreRow(chore) {
  const kid = KID_LIST.find((k) => k.id === chore.kid);
  return `
    <li style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid #333;">
      <span>${chore.icon}</span>
      <strong>${chore.title}</strong>
      <span style="color:${kid?.color};">${kid?.displayName ?? chore.kid}</span>
      <span>${chore.days.join(",")}</span>
      <span>${chore.starValue}⭐</span>
      <button data-delete-chore="${chore.id}" style="margin-left:auto;">Delete</button>
    </li>
  `;
}

function rewardRow(reward) {
  return `
    <li style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid #333;">
      <strong>${reward.title}</strong>
      <span>${reward.starCost}⭐</span>
      <span>${reward.active ? "active" : "inactive"}</span>
      <button data-toggle-reward="${reward.id}">${reward.active ? "Deactivate" : "Activate"}</button>
      <button data-redeem-reward="${reward.id}">Redeem</button>
      <button data-delete-reward="${reward.id}" style="margin-left:auto;">Delete</button>
    </li>
  `;
}

function render() {
  app.innerHTML = `
    <h1>Parent panel</h1>

    <section>
      <h2>Stars</h2>
      <p>
        ${KID_LIST.map((k) => `${k.displayName}: ${stars.lifetime[k.id] ?? 0}⭐`).join(" · ")}
        <br/>Team pool available: ${stars.joint.available}⭐ (earned ${stars.joint.earned}, spent ${stars.joint.spent})
      </p>
    </section>

    <section>
      <h2>Chores</h2>
      <ul style="list-style:none;padding:0;margin:0 0 1rem;">
        ${chores.map(choreRow).join("") || "<li>No chores yet</li>"}
      </ul>
      <form id="chore-form">
        <input name="title" placeholder="Chore title" required />
        <select name="kid">
          ${KID_LIST.map((k) => `<option value="${k.id}">${k.displayName}</option>`).join("")}
        </select>
        <input name="starValue" type="number" min="1" value="1" style="width:4rem;" />
        <input name="icon" placeholder="icon" style="width:4rem;" />
        <br/>
        ${WEEKDAYS.map(
          ([code, label]) =>
            `<label><input type="checkbox" name="days" value="${code}" /> ${label}</label>`,
        ).join(" ")}
        <br/>
        <button type="submit">Add chore</button>
      </form>
    </section>

    <section>
      <h2>Rewards</h2>
      <ul style="list-style:none;padding:0;margin:0 0 1rem;">
        ${rewards.map(rewardRow).join("") || "<li>No rewards yet</li>"}
      </ul>
      <form id="reward-form">
        <input name="title" placeholder="Reward title" required />
        <input name="starCost" type="number" min="1" placeholder="star cost" required style="width:6rem;" />
        <button type="submit">Add reward</button>
      </form>
    </section>
  `;

  document.getElementById("chore-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const days = form.getAll("days");
    if (days.length === 0) {
      alert("Pick at least one day");
      return;
    }
    await api.post("/chores", {
      title: form.get("title"),
      kid: form.get("kid"),
      days,
      starValue: Number(form.get("starValue")),
      icon: form.get("icon") || undefined,
    });
    await refresh();
  });

  document.getElementById("reward-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    await api.post("/rewards", {
      title: form.get("title"),
      starCost: Number(form.get("starCost")),
    });
    await refresh();
  });

  app.querySelectorAll("[data-delete-chore]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api.del(`/chores?id=${btn.dataset.deleteChore}`);
      await refresh();
    });
  });

  app.querySelectorAll("[data-toggle-reward]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reward = rewards.find((r) => r.id === btn.dataset.toggleReward);
      await api.patch("/rewards", { id: reward.id, active: !reward.active });
      await refresh();
    });
  });

  app.querySelectorAll("[data-delete-reward]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api.del(`/rewards?id=${btn.dataset.deleteReward}`);
      await refresh();
    });
  });

  app.querySelectorAll("[data-redeem-reward]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api.post("/redemptions", { rewardId: btn.dataset.redeemReward });
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

app.innerHTML = "Loading…";
refresh();
