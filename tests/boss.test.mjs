import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, BossBattle, bossFor } from '../boss.js';
import { FACTS, SUM_FACTS } from '../engine.js';

test('bosses grow from slime to dragon at fluency thresholds for both subjects', () => {
  for (const total of [66,126]) {
    assert.equal(bossFor(0,total), BOSSES[0]);
    assert.equal(bossFor(Math.ceil(total*.25)-1,total), BOSSES[0]);
    assert.equal(bossFor(Math.ceil(total*.25),total), BOSSES[1]);
    assert.equal(bossFor(Math.ceil(total*.5),total), BOSSES[2]);
    assert.equal(bossFor(Math.ceil(total*.75),total), BOSSES[3]);
    assert.equal(bossFor(total,total), BOSSES[3]);
  }
});
test('incorrect and invalid answers do no damage; correction awards smaller damage once', () => {
  const b = new BossBattle(BOSSES[0], [FACTS[0]]);
  assert.equal(b.submit(''),null); assert.equal(b.submit('4x'),null);
  assert.equal(b.submit(999).damage,0); assert.equal(b.hp,60);
  assert.equal(b.submit(b.question.answer).damage,10);
  assert.equal(b.submit(b.question.answer),null); assert.equal(b.hp,50);
  b.next(); assert.equal(b.submit(b.question.answer).damage,20);
});
test('every boss can be defeated, health stops at zero and replay starts fresh', () => {
  for (const boss of BOSSES) {
    const b = new BossBattle(boss, SUM_FACTS);
    while(b.hp) { b.submit(b.question.answer); b.next(); }
    assert.equal(b.hits,boss.hp/20);
    assert.equal(b.submit(b.question.answer),null);
    assert.equal(new BossBattle(boss,FACTS).hp,boss.hp);
  }
});
test('practice damage can finish a fight without negative health', () => {
  const b = new BossBattle(BOSSES[0], [FACTS[0]]);
  b.submit(999); b.submit(b.question.answer); b.next();
  b.submit(b.question.answer); b.next(); b.submit(b.question.answer); b.next();
  assert.deepEqual(b.submit(b.question.answer),{correct:true,damage:10,won:true});
});
