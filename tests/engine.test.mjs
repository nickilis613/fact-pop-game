import test from "node:test";
import assert from "node:assert/strict";
import {
  FACTS,
  TABLES,
  ROUND_LENGTH,
  factKey,
  makeOptions,
  freshProgress,
  parseProgress,
  Mission,
  status,
} from "../engine.js";

function create(settings = {}) {
  let now = 0;
  const data = freshProgress();
  Object.assign(data.settings, settings);
  const mission = new Mission(data, { rng: () => 0.37, clock: () => now });
  return {
    data,
    mission,
    advance: (ms) => {
      now += ms;
    },
  };
}
test("all facts have unique canonical keys and exactly one correct choice", () => {
  assert.equal(FACTS.length, 66);
  assert.equal(new Set(FACTS.map((f) => f.key)).size, 66);
  for (const a of TABLES)
    for (const b of TABLES)
      for (const rng of [() => 0, () => 0.999, Math.random]) {
        const options = makeOptions(a, b, rng);
        assert.equal(options.length, 4);
        assert.equal(new Set(options).size, 4);
        assert.equal(options.filter((n) => n === a * b).length, 1);
        assert.ok(options.every((n) => n > 0));
        assert.equal(factKey(a, b), factKey(b, a));
      }
});
test("missions honor selected tables and never immediately repeat a commuted fact", () => {
  for (const table of TABLES) {
    const { mission } = create({ tables: [table] });
    let previous;
    while (!mission.finished) {
      assert.equal(mission.question.a, table);
      assert.notEqual(mission.question.key, previous);
      previous = mission.question.key;
      mission.submit(mission.question.answer);
      mission.next();
    }
    assert.equal(mission.history.length, ROUND_LENGTH);
  }
});
test("missed facts return after two intervening questions, with guided retries excluded from results", () => {
  const { data, mission } = create();
  const q = mission.question;
  const result = mission.submit(999);
  assert.equal(result.correct, false);
  assert.equal(mission.stage, "retry");
  assert.equal(mission.next(), false);
  assert.equal(mission.submit(998).correct, false);
  assert.equal(mission.history.length, 1);
  assert.equal(mission.submit(q.answer).guided, true);
  assert.equal(mission.history.length, 1);
  assert.equal(data.facts[q.key].correct, 0);
  for (let i = 0; i < 2; i++) {
    mission.next();
    assert.notEqual(mission.question.key, q.key);
    mission.submit(mission.question.answer);
  }
  mission.next();
  assert.equal(mission.question.key, q.key);
  assert.equal(mission.question.review, true);
});
test("scoring cannot be duplicated, and invalid input cannot consume a question", () => {
  const { data, mission } = create();
  for (const value of [NaN, -1, 1.2, 1000, "42"]) assert.equal(mission.submit(value), null);
  assert.equal(mission.history.length, 0);
  mission.submit(mission.question.answer);
  const xp = data.xp;
  assert.equal(mission.submit(mission.question.answer), null);
  assert.equal(data.xp, xp);
  mission.finish();
  mission.finish();
  assert.equal(data.missions, 1);
  assert.equal(mission.next(), false);
});
test("pause excludes idle time and disqualifies the current answer from speed and fluency", () => {
  const { data, mission, advance } = create({ mode: "sprint" });
  advance(1000);
  mission.pause();
  advance(60000);
  assert.equal(mission.submit(mission.question.answer), null);
  mission.resume();
  advance(500);
  const result = mission.submit(mission.question.answer);
  assert.equal(mission.history[0].ms, 1500);
  assert.equal(result.speed, 0);
  assert.equal(data.facts[mission.question.key].recent[0].paused, true);
});
test("sprint allows accurate answers after the bonus window, without a timeout penalty", () => {
  const { mission, advance } = create({ mode: "sprint" });
  advance(15000);
  const result = mission.submit(mission.question.answer);
  assert.equal(result.correct, true);
  assert.equal(result.speed, 0);
  assert.equal(result.earned, 100);
});
test("fluency requires three recent fast typed answers across two missions", () => {
  const r = {
    attempts: 3,
    lastCorrect: true,
    recent: [
      { correct: true, ms: 2000, mission: 1, paused: false },
      { correct: true, ms: 2100, mission: 1, paused: false },
      { correct: true, ms: 1900, mission: 2, paused: false },
    ],
  };
  assert.equal(status(r), "secure");
  r.recent[2].mission = 1;
  assert.equal(status(r), "learning");
  r.recent[2].mission = 2;
  r.recent[2].correct = false;
  assert.equal(status(r), "learning");
  r.recent[2].correct = true;
  r.recent[2].ms = 3001;
  assert.equal(status(r), "learning");
  r.recent[2].ms = 2000;
  r.lastCorrect = false;
  assert.equal(status(r), "learning");
});
test("multiple choice never creates typed recall evidence", () => {
  const { data, mission } = create({ mode: "choice" });
  mission.submit(mission.question.answer);
  const r = data.facts[mission.question.key];
  assert.equal(r.typed, 0);
  assert.equal(r.recent.length, 0);
  assert.equal(status(r), "learning");
});
test("progress survives reload, rejects corrupt values, and handles invalid preferences", () => {
  const { data, mission } = create();
  mission.submit(mission.question.answer);
  mission.finish();
  assert.deepEqual(parseProgress(JSON.stringify(data)), data);
  assert.deepEqual(parseProgress(null), freshProgress());
  for (const raw of [
    "{",
    "null",
    "{}",
    JSON.stringify({ ...data, xp: -1 }),
    JSON.stringify({ ...data, facts: { [mission.question.key]: { attempts: 1, correct: 2 } } }),
  ])
    assert.throws(() => parseProgress(raw));
  const recovered = parseProgress(
    JSON.stringify({ ...data, settings: { tables: [], mode: "sprint", goal: 5000 } }),
  );
  assert.deepEqual(recovered.settings, freshProgress().settings);
});
test("late missed facts remain in saved progress for future missions", () => {
  const { data, mission } = create();
  for (let i = 0; i < 11; i++) {
    mission.submit(mission.question.answer);
    mission.next();
  }
  const key = mission.question.key;
  mission.submit(999);
  mission.submit(mission.question.answer);
  mission.next();
  assert.equal(mission.finished, true);
  assert.equal(data.facts[key].lastCorrect, false);
  assert.equal(data.missions, 1);
});
test("starting and abandoning an empty mission does not count as completed practice", () => {
  const { data, mission } = create();
  mission.finish();
  assert.equal(data.missions, 0);
  assert.equal(data.xp, 0);
});
