export const DAYPARTS = [
  { id: "morning", label: "Morning", icon: "🌅" },
  { id: "afternoon", label: "Afternoon", icon: "☀️" },
  { id: "evening", label: "Evening", icon: "🌙" },
  { id: "anytime", label: "Anytime", icon: "🕓" },
];

export const DAYPART_IDS = DAYPARTS.map((d) => d.id);

export function daypartFor(id) {
  return DAYPARTS.find((d) => d.id === id) ?? DAYPARTS[DAYPARTS.length - 1];
}
