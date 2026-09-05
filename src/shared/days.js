const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function dayCodeFor(date) {
  return DAY_CODES[date.getDay()];
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Returns the ISO date of the Monday that starts the current week. */
export function startOfWeekIso(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

/** Returns the next `count` days starting today, each as {date, iso, dayCode, label}. */
export function upcomingDays(count = 7, from = new Date()) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(from);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + i);
    days.push({
      date,
      iso: isoDate(date),
      dayCode: dayCodeFor(date),
      label: i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    });
  }
  return days;
}
