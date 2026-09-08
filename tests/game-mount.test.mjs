import test from 'node:test';
import assert from 'node:assert/strict';
import { mountGame } from '../game.js';
import { PROFILES_KEY } from '../profiles.js';
import { STORAGE_KEY, freshProgress } from '../engine.js';

function element() {
  return {value: '', hidden: false, style: {}, dataset: {}, handlers: {}, innerHTML: '',
    addEventListener(name, fn) { this.handlers[name] = fn; }, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, focus() {},
    classList: {toggle() {}, remove() {}, add() {}},
    querySelectorAll() {return [];}, replaceChildren(...children) {this.children = children;},
    fire(name) { this.handlers[name]({preventDefault() {}}); }
  };
}
test('game startup renders factors, creates profiles, switches and restores after reload', () => {
  const stored = new Map();
  const legacy = freshProgress(); legacy.student = 'Original'; legacy.xp = 100;
  stored.set(STORAGE_KEY, JSON.stringify(legacy));
  globalThis.localStorage = {getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v)};
  globalThis.document = {...element(), createElement: element};
  globalThis.window = element();
  const mount = () => {
    const els = new Map();
    const root = {...element(), querySelector(id) {if (!els.has(id)) els.set(id, element()); return els.get(id);}};
    const unmount = mountGame(root);
    return { get: id => root.querySelector('#'+id), unmount };
  };
  let ui = mount();
  assert.equal((ui.get('table-picker').innerHTML.match(/data-table=/g) || []).length, 11);
  assert.equal(ui.get('student-picker').children[0].textContent, 'Original');
  ui.get('new-student-name').value = 'New Student';
  ui.get('add-student-form').fire('submit');
  let roster = JSON.parse(stored.get(PROFILES_KEY));
  assert.equal(roster.profiles.length, 2);
  assert.equal(roster.profiles[0].progress.xp, 100);
  assert.equal(ui.get('student-name').value, 'New Student');
  ui.get('student-picker').value = 'initial';
  ui.get('student-picker').fire('change');
  assert.equal(ui.get('student-name').value, 'Original');
  assert.equal(ui.get('total-xp').textContent, '100');
  ui.get('reset-yes').fire('click');
  assert.equal(ui.get('student-name').value, 'Original');
  ui.unmount(); ui = mount();
  assert.equal(ui.get('student-picker').children.length, 2);
  assert.equal(ui.get('student-name').value, 'Original');
  assert.equal((ui.get('table-picker').innerHTML.match(/data-table=/g) || []).length, 11);
  ui.unmount();
});
