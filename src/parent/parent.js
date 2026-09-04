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
let google = { connected: false, calendars: [], selectedIds: [] };
let googleNotice = null;

/** Runs a write action; on 401 (session missing/expired) drops back to the login screen. */
async function guarded(action) {
  try {
    await action();
  } catch (err) {
    if (err.status === 401) {
      renderLogin("Session expired — please log in again.");
    } else {
      alert(err.message);
    }
  }
}

function renderLogin(message = "") {
  app.innerHTML = `
    <div style="max-width:280px;margin:4rem auto;text-align:center;">
      <h1>Parent login</h1>
      ${message ? `<p style="color:#b91c1c;">${message}</p>` : ""}
      <form id="login-form">
        <input name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" style="font-size:1.2rem;padding:0.5rem;width:100%;box-sizing:border-box;" autofocus />
        <button type="submit" style="margin-top:0.75rem;width:100%;padding:0.5rem;">Log in</button>
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
  [chores, rewards, stars, google] = await Promise.all([
    api.get("/chores"),
    api.get("/rewards"),
    api.get("/stars"),
    api.get("/google-calendars"),
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
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <h1>Parent panel</h1>
      <button id="logout">Log out</button>
    </div>

    <section>
      <h2>Stars</h2>
      <p>
        ${KID_LIST.map((k) => `${k.displayName}: ${stars.lifetime[k.id] ?? 0}⭐`).join(" · ")}
        <br/>Team pool available: ${stars.joint.available}⭐ (earned ${stars.joint.earned}, spent ${stars.joint.spent})
      </p>
    </section>

    <section>
      <h2>Google Calendar</h2>
      ${googleNotice ? `<p style="color:${googleNotice.ok ? "#15803d" : "#b91c1c"};">${googleNotice.text}</p>` : ""}
      ${
        google.connected
          ? `
            <p>Connected. Pick which calendars show on the kiosk:</p>
            <form id="calendars-form">
              ${google.calendars
                .map(
                  (c) => `
                <label style="display:block;">
                  <input type="checkbox" name="calendarIds" value="${c.id}" ${
                    google.selectedIds.includes(c.id) ? "checked" : ""
                  } />
                  ${c.summary}${c.primary ? " (primary)" : ""}
                </label>
              `,
                )
                .join("")}
              <button type="submit">Save selection</button>
            </form>
            <button id="google-sync-now" style="margin-top:0.5rem;">Sync now</button>
            <button id="google-disconnect" style="margin-top:0.5rem;">Disconnect</button>
          `
          : `<a href="/api/google-oauth-start"><button type="button">Connect Google Calendar</button></a>`
      }
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

  document.getElementById("logout").addEventListener("click", async () => {
    await api.del("/auth");
    renderLogin();
  });

  document.getElementById("calendars-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const calendarIds = new FormData(e.target).getAll("calendarIds");
    guarded(async () => {
      await api.post("/google-calendars", { calendarIds });
      googleNotice = { ok: true, text: "Calendar selection saved." };
      await refresh();
    });
  });

  document.getElementById("google-sync-now")?.addEventListener("click", () => {
    guarded(async () => {
      const result = await api.post("/sync-calendar", {});
      googleNotice = result.synced
        ? { ok: true, text: `Synced ${result.events.length} events.` }
        : { ok: false, text: `Sync skipped: ${result.reason}` };
      render();
    });
  });

  document.getElementById("google-disconnect")?.addEventListener("click", () => {
    if (!confirm("Disconnect Google Calendar?")) return;
    guarded(async () => {
      await api.del("/google-calendars");
      googleNotice = { ok: true, text: "Disconnected." };
      await refresh();
    });
  });

  document.getElementById("chore-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const days = form.getAll("days");
    if (days.length === 0) {
      alert("Pick at least one day");
      return;
    }
    guarded(async () => {
      await api.post("/chores", {
        title: form.get("title"),
        kid: form.get("kid"),
        days,
        starValue: Number(form.get("starValue")),
        icon: form.get("icon") || undefined,
      });
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
      await refresh();
    });
  });

  app.querySelectorAll("[data-delete-chore]").forEach((btn) => {
    btn.addEventListener("click", () => {
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
      guarded(async () => {
        await api.del(`/rewards?id=${btn.dataset.deleteReward}`);
        await refresh();
      });
    });
  });

  app.querySelectorAll("[data-redeem-reward]").forEach((btn) => {
    btn.addEventListener("click", () => {
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
  googleNotice =
    google === "connected"
      ? { ok: true, text: "Google Calendar connected." }
      : { ok: false, text: params.get("message") || "Google Calendar connection failed." };
  window.history.replaceState({}, "", window.location.pathname);
}

async function init() {
  app.innerHTML = "Loading…";
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
