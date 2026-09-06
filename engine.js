export const ROUND_LENGTH = 12;
export const STORAGE_KEY = "fact-pop.progress.v2";
export const TABLES = Array.from({ length: 11 }, (_, i) => i + 2);
export const factKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join("x");
export const FACTS = TABLES.flatMap((a) =>
  TABLES.filter((b) => b >= a).map((b) => ({ a, b, key: factKey(a, b), answer: a * b })),
);
export const freshProgress = () => ({
  version: 2,
  xp: 0,
  missions: 0,
  nextMission: 0,
  facts: {},
  settings: { mode: "recall", tables: [2, 5, 10], goal: 5000, sound: false },
});
const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9;
export function parseProgress(raw) {
  if (!raw) return freshProgress();
  const p = JSON.parse(raw);
  if (
    !p ||
    p.version !== 2 ||
    !count(p.xp) ||
    !count(p.missions) ||
    !count(p.nextMission) ||
    !p.facts ||
    typeof p.facts !== "object"
  )
    throw Error("Unrecognized saved progress");
  const result = freshProgress();
  result.xp = p.xp;
  result.missions = p.missions;
  result.nextMission = p.nextMission;
  for (const f of FACTS) {
    const r = p.facts[f.key];
    if (!r) continue;
    if (
      !count(r.attempts) ||
      !count(r.correct) ||
      r.correct > r.attempts ||
      !count(r.typed) ||
      !count(r.typedCorrect) ||
      r.typedCorrect > r.typed ||
      r.typed > r.attempts ||
      !Array.isArray(r.recent) ||
      r.recent.length > 3 ||
      !Number.isFinite(r.lastSeen) ||
      r.lastSeen < 0 ||
      typeof r.lastCorrect !== "boolean"
    )
      throw Error("Invalid fact progress");
    const recent = r.recent.map((s) => {
      if (
        !s ||
        typeof s.correct !== "boolean" ||
        !Number.isFinite(s.ms) ||
        s.ms < 0 ||
        !count(s.mission) ||
        typeof s.paused !== "boolean"
      )
        throw Error("Invalid recall sample");
      return { correct: s.correct, ms: s.ms, mission: s.mission, paused: s.paused };
    });
    result.facts[f.key] = {
      attempts: r.attempts,
      correct: r.correct,
      typed: r.typed,
      typedCorrect: r.typedCorrect,
      recent,
      lastSeen: r.lastSeen,
      lastCorrect: r.lastCorrect,
    };
  }
  const s = p.settings;
  if (
    s &&
    ["recall", "sprint", "choice"].includes(s.mode) &&
    Array.isArray(s.tables) &&
    s.tables.length &&
    s.tables.every((t) => TABLES.includes(t)) &&
    [3000, 5000, 8000].includes(s.goal)
  )
    result.settings = {
      mode: s.mode,
      tables: [...new Set(s.tables)],
      goal: s.goal,
      sound: s.sound === true,
    };
  return result;
}
export function status(record) {
  if (!record?.attempts) return "fresh";
  const samples = record.recent;
  return record.lastCorrect &&
    samples.length === 3 &&
    samples.every((s) => s.correct && !s.paused && s.ms <= 3000) &&
    new Set(samples.map((s) => s.mission)).size >= 2
    ? "secure"
    : "learning";
}
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeOptions(a, b, rng = Math.random) {
  const answer = a * b;
  const distractors = [
    ...new Set(
      [answer - a, answer + a, answer - b, answer + b, answer + 1, answer + 2, answer + 3].filter(
        (n) => n > 0 && n !== answer,
      ),
    ),
  ];
  return shuffle([answer, ...shuffle(distractors, rng).slice(0, 3)], rng);
}
export function hint(a, b) {
  if (a === 2) return `Double ${b}: ${b} + ${b} = ${a * b}.`;
  if (a === 10) return `Ten groups of ${b} make ${a * b}.`;
  if (a === 5) return `Half of 10 × ${b}: ${10 * b} ÷ 2 = ${a * b}.`;
  if (a === 9) return `Use 10 × ${b}, then take away ${b}: ${10 * b} − ${b} = ${a * b}.`;
  return `Use ${a - 1} × ${b}, then add one more ${b}: ${(a - 1) * b} + ${b} = ${a * b}.`;
}
export class Mission {
  constructor(progress, { rng = Math.random, clock = () => performance.now() } = {}) {
    this.progress = progress;
    this.rng = rng;
    this.clock = clock;
    this.settings = { ...progress.settings, tables: [...progress.settings.tables] };
    this.id = ++progress.nextMission;
    this.history = [];
    this.queue = [];
    this.xp = 0;
    this.streak = 0;
    this.best = 0;
    this.stage = "ready";
    this.finished = false;
    this.pool = FACTS.filter(
      (f) => this.settings.tables.includes(f.a) || this.settings.tables.includes(f.b),
    );
    this.next();
  }
  next() {
    if (this.finished || !["ready", "feedback"].includes(this.stage)) return false;
    if (this.history.length >= ROUND_LENGTH) {
      this.finish();
      return true;
    }
    const recent = new Set(this.history.slice(-2).map((h) => h.key));
    let index = this.queue.findIndex((q) => q.due <= this.history.length && !recent.has(q.key));
    let f;
    if (index >= 0) {
      const [item] = this.queue.splice(index, 1);
      f = this.pool.find((p) => p.key === item.key);
    }
    const review = !!f;
    if (!f) {
      const pending = new Set(this.queue.map((q) => q.key));
      let candidates = this.pool.filter((p) => !recent.has(p.key) && !pending.has(p.key));
      if (!candidates.length) candidates = this.pool.filter((p) => !recent.has(p.key));
      const weights = candidates.map((p) => {
        const r = this.progress.facts[p.key];
        const seen = this.history.some((h) => h.key === p.key);
        return (r ? (!r.lastCorrect ? 7 : status(r) === "secure" ? 1 : 4) : 5) * (seen ? 0.35 : 1);
      });
      let ticket = this.rng() * weights.reduce((a, b) => a + b, 0);
      f = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        ticket -= weights[i];
        if (ticket < 0) {
          f = candidates[i];
          break;
        }
      }
    }
    let { a, b } = f;
    if (!this.settings.tables.includes(a) || (this.settings.tables.includes(b) && this.rng() > 0.5))
      [a, b] = [b, a];
    this.question = { ...f, a, b, options: makeOptions(a, b, this.rng), review };
    this.stage = "answer";
    this.started = this.clock();
    this.elapsed = 0;
    this.wasPaused = false;
    return true;
  }
  elapsedMs() {
    return this.elapsed + (this.stage === "answer" ? Math.max(0, this.clock() - this.started) : 0);
  }
  submit(value) {
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 999 ||
      !["answer", "retry"].includes(this.stage)
    )
      return null;
    const q = this.question;
    if (this.stage === "retry") {
      const correct = value === q.answer;
      if (correct) this.stage = "feedback";
      return { guided: true, correct, earned: 0 };
    }
    this.elapsed = this.elapsedMs();
    const correct = value === q.answer;
    const typed = this.settings.mode !== "choice";
    this.streak = correct ? this.streak + 1 : 0;
    this.best = Math.max(this.best, this.streak);
    const speed =
      correct && this.settings.mode === "sprint" && !this.wasPaused
        ? Math.round(50 * Math.max(0, 1 - this.elapsed / this.settings.goal))
        : 0;
    const streakBonus = correct && this.streak % 3 === 0 ? 25 : 0;
    const earned = 20 + (correct ? 80 : 0) + speed + streakBonus;
    this.xp += earned;
    this.progress.xp += earned;
    const r = (this.progress.facts[q.key] ||= {
      attempts: 0,
      correct: 0,
      typed: 0,
      typedCorrect: 0,
      recent: [],
      lastSeen: 0,
      lastCorrect: false,
    });
    r.attempts++;
    r.correct += Number(correct);
    r.lastCorrect = correct;
    r.lastSeen = Date.now();
    if (typed) {
      r.typed++;
      r.typedCorrect += Number(correct);
      r.recent = [
        ...r.recent,
        { correct, ms: this.elapsed, mission: this.id, paused: this.wasPaused },
      ].slice(-3);
    }
    this.history.push({
      key: q.key,
      a: q.a,
      b: q.b,
      correct,
      ms: this.elapsed,
      earned,
      paused: this.wasPaused,
    });
    if (!correct) {
      this.queue = this.queue.filter((i) => i.key !== q.key);
      this.queue.push({ key: q.key, due: this.history.length + 2 });
    }
    this.stage = correct ? "feedback" : "retry";
    return { correct, earned, guided: false, speed, streakBonus };
  }
  pause() {
    if (this.finished || this.stage === "paused") return false;
    if (this.stage === "answer") {
      this.elapsed = this.elapsedMs();
      this.wasPaused = true;
    }
    this.previousStage = this.stage;
    this.stage = "paused";
    return true;
  }
  resume() {
    if (this.stage !== "paused") return false;
    this.stage = this.previousStage;
    this.started = this.clock();
    return true;
  }
  finish() {
    if (this.finished) return false;
    this.finished = true;
    this.stage = "complete";
    if (this.history.length) this.progress.missions++;
    return true;
  }
}
