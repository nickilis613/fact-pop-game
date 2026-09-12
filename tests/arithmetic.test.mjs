import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDENDS, ADDITION_FACTS, SUBTRACTION_FACTS, SUM_FACTS, ALL_FACTS, freshProgress, freshAdditionSettings, parseProgress, Mission, makeOptions, hint } from '../engine.js';
import { exportProgressCSV, importProgressCSV } from '../progress-csv.js';
import { CloudClient, CloudSaves } from '../cloud.js';

test('1–9 arithmetic covers every addition pair and inverse subtraction exactly once', () => {
  assert.equal(ADDITION_FACTS.length, 45);
  assert.equal(SUBTRACTION_FACTS.length, 81);
  assert.equal(new Set(ALL_FACTS.map(f => f.key)).size, 192);
  for (const a of ADDENDS) for (const b of ADDENDS) {
    assert.ok(ADDITION_FACTS.some(f => f.key === `${Math.min(a,b)}+${Math.max(a,b)}` && f.answer === a+b));
    assert.ok(SUBTRACTION_FACTS.some(f => f.a === a+b && f.b === b && f.answer === a));
  }
  assert.ok(SUM_FACTS.every(f => f.a > 0 && f.b > 0 && f.answer > 0 && Math.max(f.a,f.answer) <= 18));
  for (const f of SUM_FACTS) for (const rng of [() => 0, () => 0.999]) {
    const options = makeOptions(f.a, f.b, rng, f.operation);
    assert.equal(options.length, 4);
    assert.equal(new Set(options).size, 4);
    assert.equal(options.filter(n => n === f.answer).length, 1);
    assert.ok(options.every(n => n >= 0));
    assert.ok(hint(f.a, f.b, f.operation).includes(String(f.answer)));
  }
});

test('each operation honors chosen addends, keeps subtraction ordered, and completes a round', () => {
  for (const operation of ['+', '−', 'mixed']) for (const number of ADDENDS) {
    const p = freshProgress();
    p.additionSettings = {...freshAdditionSettings(), tables: [number], operation};
    const m = new Mission(p, {subject: 'addition', rng: () => 0.37, clock: () => 100});
    let previous;
    while (!m.finished) {
      const q = m.question;
      assert.ok(operation === 'mixed' || q.operation === operation);
      assert.ok(q.operation === '+' ? q.a === number || q.b === number : q.answer === number || q.b === number);
      assert.equal(q.answer, q.operation === '+' ? q.a + q.b : q.a - q.b);
      assert.notEqual(q.key, previous);
      previous = q.key;
      assert.equal(m.submit(q.answer).correct, true);
      m.next();
    }
    assert.equal(m.history.length, 12);
    assert.equal(p.daily.rounds, 1);
    assert.equal(Object.keys(p.facts).some(k => k.includes('x')), false);
  }
});

test('guided subtraction corrections preserve first attempt evidence and schedule review', () => {
  const p = freshProgress(); p.additionSettings = {...freshAdditionSettings(), operation: '−'};
  const m = new Mission(p, {subject:'addition', rng:()=>0.4});
  const q = m.question;
  m.submit(999);
  assert.equal(m.stage, 'retry');
  assert.equal(m.submit(q.answer).guided, true);
  assert.equal(p.facts[q.key].correct, 0);
  for (let i=0;i<2;i++) {m.next(); assert.notEqual(m.question.key,q.key); m.submit(m.question.answer);}
  m.next(); assert.equal(m.question.key,q.key);
});

test('both subjects survive reload, CSV and cloud without conflating facts or settings', async () => {
  const p = freshProgress(); p.student='Arithmetic test';
  const multiplication = new Mission(p); multiplication.submit(multiplication.question.answer);
  p.additionSettings = {...freshAdditionSettings(), mode: 'sprint', tables: [9], operation: '+'};
  const addition = new Mission(p,{subject:'addition'}); addition.submit(addition.question.answer);
  const saved = parseProgress(JSON.stringify(p));
  assert.deepEqual(saved,p);
  assert.deepEqual(importProgressCSV(exportProgressCSV(p)),p);
  assert.ok(exportProgressCSV(p).includes('fact-pop-v3'));
  assert.deepEqual(p.settings.tables,[2,5,10]);
  const writes=[];
  const saves = new CloudSaves({async rpc(name,args){writes.push(args.p_progress);return {revision:2};}});
  saves.register({id:'test',revision:1}); await saves.save('test',p);
  const client = new CloudClient({url:'https://example.test',key:'test'}, async()=>({ok:true,async text(){return JSON.stringify([{id:'test',progress:writes[0]}]);}}));
  client.session={access_token:'test',expiresAt:Date.now()+100000};
  assert.deepEqual((await client.students())[0].progress,p);
  const broken={...p,additionSettings:{...p.additionSettings,tables:[0]}};
  assert.throws(()=>parseProgress(JSON.stringify(broken)),/addition practice/);
});
