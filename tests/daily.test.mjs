import test from "node:test";
import assert from "node:assert/strict";
import { Mission, freshProgress, parseProgress, dailyProgress, localDateKey } from "../engine.js";
import { exportProgressCSV, importProgressCSV } from "../progress-csv.js";
import { loadProfiles, storeProfile, newStudent } from "../profiles.js";
import { CloudClient, CloudSaves } from "../cloud.js";

const today = () => new Date(2026, 8, 9, 14);
const tomorrow = () => new Date(2026, 8, 10, 0, 1);
function round(data, date = today) {
  return new Mission(data, { date, rng: () => 0.37, clock: () => 0 });
}
function finish(mission) {
  while (!mission.finished) {
    mission.submit(mission.question.answer);
    mission.next();
  }
}

test("three daily rounds accumulate XP and streaks, and extra rounds remain playable", () => {
  const data = freshProgress();
  for (let i = 1; i <= 4; i++) {
    const mission = round(data);
    finish(mission);
    assert.deepEqual(dailyProgress(data, today()), {
      date: "2026-09-09", rounds: i, xp: 1300 * i, streak: 12 * i, best: 12 * i,
    });
    mission.finish();
    assert.equal(data.daily.rounds, i);
  }
  assert.equal(data.xp, 5200);
});

test("early finishes save XP and streaks without filling the daily round ticker", () => {
  const data = freshProgress();
  const empty = round(data);
  empty.finish();
  assert.equal(data.daily, null);
  const partial = round(data);
  partial.submit(partial.question.answer);
  partial.finish();
  assert.deepEqual(data.daily, {date: "2026-09-09", rounds: 0, xp: 100, streak: 1, best: 1});
});

test("mistakes reset today's current streak; guided retries add neither XP nor streak evidence", () => {
  const data = freshProgress();
  finish(round(data));
  const mission = round(data);
  mission.submit(999);
  assert.equal(data.daily.streak, 0);
  assert.equal(data.daily.best, 12);
  assert.equal(data.daily.xp, 1320);
  const before = structuredClone(data.daily);
  mission.submit(998);
  mission.submit(mission.question.answer);
  assert.deepEqual(data.daily, before);
  mission.next();
  mission.submit(mission.question.answer);
  assert.equal(data.daily.streak, 1);
});

test("the last answer saves the completed round before the results button, with no double count", () => {
  const data = freshProgress();
  const mission = round(data);
  for (let i = 0; i < 11; i++) {
    mission.submit(mission.question.answer);
    mission.next();
  }
  mission.submit(999);
  assert.equal(data.daily.rounds, 0);
  mission.submit(mission.question.answer);
  assert.equal(data.daily.rounds, 1);
  const restored = parseProgress(JSON.stringify(data));
  assert.deepEqual(restored.daily, data.daily);
  mission.submit(mission.question.answer);
  mission.next();
  mission.finish();
  assert.equal(data.daily.rounds, 1);
});

test("midnight resets today's display without erasing lifetime progress or writing on reads", () => {
  const data = freshProgress();
  finish(round(data));
  const before = structuredClone(data);
  assert.deepEqual(dailyProgress(data, tomorrow()), {
    date: "2026-09-10", rounds: 0, xp: 0, streak: 0, best: 0,
  });
  assert.deepEqual(data, before);
  const mission = round(data, tomorrow);
  mission.submit(mission.question.answer);
  assert.equal(data.daily.xp, 100);
  assert.equal(data.daily.streak, 1);
  assert.equal(data.daily.rounds, 0);
  assert.equal(data.xp, 1400);
});

test("a round crossing midnight credits XP when earned and the round when completed", () => {
  const data = freshProgress();
  let date = today();
  const mission = round(data, () => date);
  for (let i = 0; i < 11; i++) {
    mission.submit(mission.question.answer);
    mission.next();
  }
  assert.equal(data.daily.xp, 1175);
  date = tomorrow();
  mission.submit(mission.question.answer);
  assert.deepEqual(data.daily, {date: "2026-09-10", rounds: 1, xp: 125, streak: 1, best: 1});
  assert.equal(data.xp, 1300);
  date = new Date(2026, 8, 11);
  mission.next();
  assert.equal(data.daily.date, "2026-09-10");
  assert.equal(dailyProgress(data, date).rounds, 0);
});

test("day keys use the device's calendar date", () => {
  assert.equal(localDateKey(new Date(2026, 0, 1, 0, 1)), "2026-01-01");
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("older saves migrate without inventing daily totals, while malformed daily evidence is rejected", () => {
  const legacy = freshProgress();
  delete legacy.daily;
  legacy.xp = 1500;
  const migrated = parseProgress(JSON.stringify(legacy));
  assert.equal(migrated.xp, 1500);
  assert.equal(migrated.daily, null);
  const data = freshProgress();
  finish(round(data));
  for (const invalid of [
    {date: "2026-02-30"}, {date: "oops"}, {rounds: -1}, {rounds: 9},
    {xp: 999999}, {xp: 1.5}, {streak: 99}, {best: "12"},
  ]) {
    assert.throws(() => parseProgress(JSON.stringify({...data, daily: {...data.daily, ...invalid}})), /daily/);
  }
});

test("CSV backups preserve daily totals and still accept original restorable CSVs", () => {
  const data = freshProgress();
  finish(round(data));
  assert.deepEqual(importProgressCSV(exportProgressCSV(data)), data);
  const empty = freshProgress();
  empty.xp = 1500;
  const legacy = exportProgressCSV(empty).split("\r\n").map((line, i) => i === 0
    ? line.replace(/,"daily"$/, "")
    : line.replace('"fact-pop-v2"', '"fact-pop-v1"').replace(/,"null"$/, "")
  ).join("\r\n");
  assert.deepEqual(importProgressCSV(legacy), empty);
  const csv = exportProgressCSV(data).split("\r\n");
  csv[2] = csv[2].replace('""rounds"":1', '""rounds"":2');
  assert.throws(() => importProgressCSV(csv.join("\r\n")), /inconsistent/);
});

test("switching profiles and reloading keep daily totals separate", () => {
  const storage = {setItem(key, raw) { this.raw = raw; }};
  const alice = newStudent("Alice");
  finish(round(alice));
  let roster = loadProfiles(null, JSON.stringify(alice));
  roster = storeProfile(storage, roster, alice, "bob", newStudent("Bob"));
  const bob = roster.profiles[1].progress;
  round(bob).submit(999);
  roster = storeProfile(storage, roster, bob, "initial");
  const restored = loadProfiles(storage.raw, null);
  assert.equal(restored.profiles[0].progress.daily.rounds, 1);
  assert.equal(restored.profiles[0].progress.daily.xp, 1300);
  assert.equal(restored.profiles[1].progress.daily.rounds, 0);
  assert.equal(restored.profiles[1].progress.daily.xp, 20);
});

test("online save and load retain daily progress", async () => {
  const data = freshProgress();
  finish(round(data));
  let stored;
  const saves = new CloudSaves({ async rpc(name, payload) {
    stored = payload.p_progress;
    return { revision: 1 };
  }});
  saves.register({id: "alice", revision: 0});
  saves.save("alice", data);
  await saves.flush();
  const client = new CloudClient({url: "https://example.test", key: "test"}, async () => ({
    ok: true, text: async () => JSON.stringify([{id: "alice", progress: stored}]),
  }));
  client.setSession({access_token: "test", expires_in: 3600});
  assert.deepEqual((await client.students())[0].progress.daily, data.daily);
});
