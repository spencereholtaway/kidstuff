/**
 * FLIP (First, Last, Invert, Play) helpers for animating a list re-sort across a full
 * innerHTML re-render. Since re-rendering destroys and recreates DOM nodes, a plain CSS
 * transition can't carry across it — instead we snapshot each item's screen position before
 * the re-render, then after, nudge the (new) matching element back to its old spot with an
 * instant transform and let it transition to its real position on the next frame.
 */

/** Captures the current position of every element under `container` matching `selector`, keyed by `getKey`. */
export function flipSnapshot(container, selector, getKey) {
  const snapshot = new Map();
  if (!container) return snapshot;
  container.querySelectorAll(selector).forEach((el) => {
    snapshot.set(getKey(el), el.getBoundingClientRect());
  });
  return snapshot;
}

/** Plays the FLIP transition for every element under `container` that also appears in `snapshot`. */
export function flipAnimate(container, selector, getKey, snapshot, duration = 280) {
  if (!container || !snapshot.size) return;
  container.querySelectorAll(selector).forEach((el) => {
    const before = snapshot.get(getKey(el));
    if (!before) return;
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (!dx && !dy) return;

    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.getBoundingClientRect(); // force reflow so the transform above actually applies first
    requestAnimationFrame(() => {
      el.style.transition = `transform ${duration}ms ease`;
      el.style.transform = "";
    });
    el.addEventListener(
      "transitionend",
      () => {
        el.style.transition = "";
      },
      { once: true },
    );
  });
}
