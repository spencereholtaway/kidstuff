import "./kioskLock.css";
import { api } from "./api.js";

/**
 * Blocks until the kiosk PIN has been entered (or was already unlocked on this device).
 * Call this before rendering any real kiosk content — home.js and kid.js both await it.
 */
export async function ensureKioskUnlocked() {
  const { authenticated } = await api.get("/kiosk-auth");
  if (authenticated) return;

  const app = document.getElementById("app");

  await new Promise((resolve) => {
    function renderLock(message = "") {
      app.innerHTML = `
        <div class="kiosk-lock">
          <div class="kiosk-lock__card">
            <h1>Enter PIN</h1>
            ${message ? `<p class="kiosk-lock__error">${message}</p>` : ""}
            <form class="kiosk-lock__form" id="kiosk-lock-form">
              <input name="pin" type="password" autocomplete="off" placeholder="••••" autofocus />
              <button type="submit">Unlock</button>
            </form>
          </div>
        </div>
      `;

      document.getElementById("kiosk-lock-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const pin = new FormData(e.target).get("pin");
        try {
          await api.post("/kiosk-auth", { pin });
          resolve();
        } catch (err) {
          renderLock(err.message || "Incorrect PIN");
        }
      });
    }

    renderLock();
  });
}
