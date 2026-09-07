import test from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, Mission, status } from '../engine.js';
import { exportProgressCSV, importProgressCSV } from '../progress-csv.js';

test('CSV restores names, settings, XP, history and fluency exactly', () => {
  const p = freshProgress();
  p.student = '=Student, "A"\nGroup 2';
  p.settings = { mode: 'sprint', tables: [4, 7], goal: 8000, sound: true };
  p.nextMission = 3; p.missions = 2; p.xp = 1234;
  p.facts['4x7'] = { attempts: 5, correct: 4, typed: 4, typedCorrect: 3, lastSeen: 1700000000000, lastCorrect: true, recent: [1,2,3].map(mission => ({correct: true, ms: 1200.5, mission, paused: false})) };
  const csv = exportProgressCSV(p);
  assert.ok(csv.includes("'=Student"));
  const restored = importProgressCSV(csv);
  assert.deepEqual(restored, p);
  assert.equal(status(restored.facts['4x7']), 'secure');
  const mission = new Mission(restored);
  assert.equal(mission.id, 4);
});

test('empty students and distinct students stay separate across transfers', () => {
  for (const student of ['', "'Alice", 'Ben']) {
    const p = freshProgress(); p.student = student;
    assert.deepEqual(importProgressCSV(exportProgressCSV(p)), p);
  }
});

test('malformed, legacy, incomplete, duplicate and mixed-student files are rejected', () => {
  const csv = exportProgressCSV(freshProgress());
  assert.throws(() => importProgressCSV('fact,answer,status,attempts,correct,typed_attempts,typed_correct'), /Older report-only/);
  const lines = csv.split('\r\n');
  assert.throws(() => importProgressCSV(lines.slice(0, -1).join('\r\n')), /66/);
  const duplicate = [...lines]; duplicate[2] = duplicate[1];
  assert.throws(() => importProgressCSV(duplicate.join('\r\n')), /duplicate/);
  const mixed = [...lines]; mixed[2] = mixed[2].replace('"\'"', '"\'Another"');
  assert.throws(() => importProgressCSV(mixed.join('\r\n')), /Mixed/);
  assert.throws(() => importProgressCSV(csv.slice(0, -1)), /unfinished/);
  assert.throws(() => importProgressCSV('x'.repeat(1_000_001)), /1 MB/);
});

test('invalid counts and fluency evidence cannot be imported', () => {
  const p = freshProgress();
  p.facts['2x2'] = {attempts: 1, correct: 1, typed: 1, typedCorrect: 1, lastSeen: 100, lastCorrect: true, recent: [{correct: true, ms: 100, mission: 50, paused: false}]};
  assert.throws(() => importProgressCSV(exportProgressCSV(p)), /Inconsistent/);
});
