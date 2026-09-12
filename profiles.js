import { freshProgress, parseProgress } from "./engine.js?v=arithmetic-1";

export const PROFILES_KEY = "fact-pop.profiles.v1";
export function loadProfiles(raw, legacy) {
  if (!raw) return { version: 1, active: "initial", profiles: [{ id: "initial", progress: parseProgress(legacy) }] };
  const roster = JSON.parse(raw);
  if (roster?.version !== 1 || !Array.isArray(roster.profiles) || !roster.profiles.length)
    throw Error("Invalid student profiles");
  const ids = new Set();
  const profiles = roster.profiles.map(p => {
    if (typeof p.id !== "string" || !p.id || ids.has(p.id)) throw Error("Invalid student profile");
    ids.add(p.id);
    return { id: p.id, progress: parseProgress(JSON.stringify(p.progress)) };
  });
  if (!ids.has(roster.active)) throw Error("Missing active student");
  return { version: 1, active: roster.active, profiles };
}

// Persist the whole roster in one write before changing the active UI.
export function storeProfile(storage, roster, current, targetId, incoming) {
  const profiles = roster.profiles.map(p => ({ ...p, progress: p.id === roster.active ? current : p.progress }));
  if (incoming) {
    const existing = profiles.find(p => p.id === targetId);
    if (existing) existing.progress = incoming;
    else profiles.push({ id: targetId, progress: incoming });
  }
  if (!profiles.some(p => p.id === targetId)) throw Error("Student not found");
  const next = { version: 1, active: targetId, profiles };
  storage.setItem(PROFILES_KEY, JSON.stringify(next));
  return next;
}

export function newStudent(name) {
  const progress = freshProgress();
  progress.student = name.trim().slice(0, 100);
  if (!progress.student) throw Error("Enter a student name or nickname.");
  return progress;
}
