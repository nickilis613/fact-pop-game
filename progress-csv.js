import { FACTS, parseProgress, freshProgress, status } from "./engine.js";

const columns = ["format", "student", "xp", "missions", "next_mission", "settings", "fact", "answer", "status", "attempts", "correct", "typed_attempts", "typed_correct", "last_seen", "last_correct", "recent"];
const cell = (value) => '"' + String(value).replaceAll('"', '""') + '"';

export function exportProgressCSV(progress) {
  const p = parseProgress(JSON.stringify(progress));
  return "\uFEFF" + [columns, ...FACTS.map(f => {
    const r = p.facts[f.key];
    return ["fact-pop-v1", "'" + p.student, p.xp, p.missions, p.nextMission,
      JSON.stringify(p.settings), f.key, f.answer, status(r), r?.attempts || 0,
      r?.correct || 0, r?.typed || 0, r?.typedCorrect || 0,
      r?.lastSeen || 0, r?.lastCorrect || false, JSON.stringify(r?.recent || [])];
  })].map(row => row.map(cell).join(",")).join("\r\n");
}

// Quoted fields may contain commas, doubled quotes, and line breaks.
function rows(text) {
  text = text.replace(/^\uFEFF/, "");
  const result = [];
  let row = [], value = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += ch;
    } else if (ch === "," || ch === "\r" || ch === "\n") {
      row.push(value); value = ""; closed = false;
      if (ch !== ",") {
        result.push(row); row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
    } else if (ch === '"' && !value && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw Error("Invalid CSV quoting.");
      value += ch;
    }
  }
  if (quoted) throw Error("The CSV has an unfinished quoted field.");
  if (value || closed || row.length) result.push([...row, value]);
  return result;
}

export function importProgressCSV(text) {
  if (typeof text !== "string" || text.length > 1_000_000) throw Error("Choose a Fact Pop CSV smaller than 1 MB.");
  const [header, ...records] = rows(text);
  if (JSON.stringify(header) !== JSON.stringify(columns))
    throw Error("This is not a restorable Fact Pop CSV. Older report-only exports cannot be restored; download a new progress CSV from Fact Pop.");
  if (records.length !== FACTS.length) throw Error("The CSV must contain all 66 facts.");
  const p = freshProgress(), seen = new Set();
  const number = value => {
    if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw Error("Invalid number in CSV.");
    return Number(value);
  };
  const first = records[0];
  if (first[0] !== "fact-pop-v1" || !first[1].startsWith("'")) throw Error("Unsupported progress format.");
  p.student = first[1].slice(1);
  [p.xp, p.missions, p.nextMission] = first.slice(2, 5).map(number);
  p.settings = JSON.parse(first[5]);
  for (const row of records) {
    if (row.length !== columns.length || row.slice(0, 6).some((v, i) => v !== first[i])) throw Error("Mixed students or inconsistent progress in CSV.");
    const f = FACTS.find(f => f.key === row[6]);
    if (!f || seen.has(f.key) || number(row[7]) !== f.answer) throw Error("Invalid or duplicate fact in CSV.");
    seen.add(f.key);
    if (!["true", "false"].includes(row[14])) throw Error("Invalid fact result.");
    const r = { attempts: number(row[9]), correct: number(row[10]), typed: number(row[11]), typedCorrect: number(row[12]), lastSeen: number(row[13]), lastCorrect: row[14] === "true", recent: JSON.parse(row[15]) };
    if (r.attempts || r.correct || r.typed || r.typedCorrect || r.lastSeen || r.lastCorrect || JSON.stringify(r.recent) !== "[]") p.facts[f.key] = r;
  }
  const validated = parseProgress(JSON.stringify(p));
  if (JSON.stringify(validated.settings) !== JSON.stringify(p.settings)) throw Error("Invalid practice settings.");
  for (const row of records) {
    const r = validated.facts[row[6]];
    if (row[8] !== status(r) || (r && (r.typedCorrect > r.correct || r.recent.length > r.typed || r.recent.some(s => s.mission > p.nextMission)))) throw Error("Inconsistent fact progress.");
  }
  return validated;
}
