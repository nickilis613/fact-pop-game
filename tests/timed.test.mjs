import test from 'node:test';
import assert from 'node:assert/strict';
import { Mission, freshProgress, parseProgress, operationSymbol, dailyProgress } from '../engine.js';
import { exportProgressCSV, importProgressCSV } from '../progress-csv.js';

const setup = (operations = ['×', '+', '−']) => {
  let now = 0;
  const progress = freshProgress();
  progress.settings.mode = 'timed';
  progress.settings.operations = operations;
  const mission = new Mission(progress, { clock: () => now });
  return { mission, progress, advance: ms => now += ms };
};
test('60-second challenges accept unlimited answers, skip corrections and stop at the deadline', () => {
  const { mission, progress, advance } = setup();
  for (let i = 0; i < 30; i++) {
    advance(1000);
    assert.ok(mission.submit(i === 0 ? 999 : mission.question.answer));
    assert.equal(mission.stage, 'feedback');
    mission.next();
  }
  assert.equal(mission.history.length, 30);
  assert.equal(mission.finished, false);
  advance(30000);
  assert.equal(mission.submit(mission.question.answer), null);
  assert.equal(mission.history.length, 30);
  assert.equal(mission.finished, true);
  assert.equal(dailyProgress(progress).rounds, 1);
  mission.finish();
  assert.equal(dailyProgress(progress).rounds, 1);
});
test('challenge pools honor individual operations and every mixed combination', () => {
  for (const operations of [['×'], ['+'], ['−'], ['×', '+'], ['+', '−'], ['×', '−'], ['×', '+', '−']]) {
    const { mission } = setup(operations);
    assert.deepEqual(new Set(mission.pool.map(operationSymbol)), new Set(operations));
    for (let i = 0; i < 50; i++) {
      assert.ok(operations.includes(operationSymbol(mission.question)));
      mission.submit(mission.question.answer); mission.next();
    }
  }
});
test('pauses stop the round clock and early finishes do not count a daily round', () => {
  const { mission, progress, advance } = setup();
  advance(5000); mission.pause(); advance(90000);
  assert.equal(mission.remainingMs(), 55000);
  mission.resume(); advance(1000);
  assert.equal(mission.remainingMs(), 54000);
  mission.submit(mission.question.answer); mission.finish();
  assert.equal(dailyProgress(progress).rounds, 0);
});
test('challenge preferences and mixed fact progress survive save and CSV restore', () => {
  const { mission, progress } = setup(['+', '−']);
  mission.submit(mission.question.answer);
  for (const restored of [parseProgress(JSON.stringify(progress)), importProgressCSV(exportProgressCSV(progress))]) {
    assert.equal(restored.settings.mode, 'timed');
    assert.deepEqual(restored.settings.operations, ['+', '−']);
    assert.deepEqual(restored.facts, progress.facts);
  }
});
