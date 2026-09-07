import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfiles, storeProfile, newStudent, PROFILES_KEY } from '../profiles.js';
import { freshProgress } from '../engine.js';

test('existing single-student progress migrates without losing data', () => {
  const p = newStudent('Alice'); p.xp = 500;
  const r = loadProfiles(null, JSON.stringify(p));
  assert.deepEqual(r.profiles[0].progress, p);
  assert.deepEqual(loadProfiles(JSON.stringify(r), null), r);
});
test('switching students, renaming and reload preserve independent progress', () => {
  const storage = {setItem(key, value) { assert.equal(key, PROFILES_KEY); this.raw = value; }};
  let r = loadProfiles(null, null);
  const alice = newStudent('Alice'); alice.xp = 120;
  r = storeProfile(storage, r, alice, 'bob', newStudent('Bob'));
  const bob = r.profiles[1].progress; bob.xp = 300;
  r = storeProfile(storage, r, bob, 'initial');
  assert.equal(r.profiles[0].progress.xp, 120);
  assert.equal(r.profiles[1].progress.xp, 300);
  assert.deepEqual(loadProfiles(storage.raw, null), r);
  const replacement = newStudent('Alice'); replacement.xp = 900;
  r = storeProfile(storage, r, alice, 'initial', replacement);
  assert.equal(r.profiles[0].progress.xp, 900);
  assert.equal(r.profiles[1].progress.xp, 300);
});
test('failed storage cannot switch or replace an existing profile', () => {
  const r = loadProfiles(null, null), before = structuredClone(r);
  assert.throws(() => storeProfile({setItem() {throw Error('quota');}}, r, freshProgress(), 'new', newStudent('Ben')), /quota/);
  assert.deepEqual(r, before);
});
test('invalid rosters and blank names are rejected', () => {
  assert.throws(() => newStudent('  '));
  const r = loadProfiles(null, null);
  r.profiles.push(r.profiles[0]);
  assert.throws(() => loadProfiles(JSON.stringify(r)), /Invalid/);
});
