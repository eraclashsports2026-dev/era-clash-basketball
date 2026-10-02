// Preserve the existing synchronous franchise API while selection-only UI
// consumes the catalog without the schedule snapshot.
export * from "./franchiseCatalog.js";
import { getFranchise, franchisePairingFor } from "./franchiseCatalog.js";
import schedule from "../../data/schedule/2026-27.json" with { type: "json" };

export function isScheduleDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function scheduleDateKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid schedule clock");
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const SCHEDULE_METADATA = Object.freeze(Object.fromEntries(Object.entries(schedule).filter(([key]) => key !== "games")));
export function getTonightGames(dateKey = scheduleDateKey()) {
  if (!isScheduleDateKey(dateKey)) throw new Error("Date must be a real YYYY-MM-DD calendar date");
  return schedule.games.filter((game) => game.date === dateKey).map((game) => Object.freeze({ ...game,
    home:getFranchise(game.homeId), away:getFranchise(game.awayId),
    pairing:franchisePairingFor(game.homeId, game.awayId),
    simulationNote:"All-time roster preview. Scheduled home/away order does not add a court advantage.",
  }));
}
