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
    fire(name) { return this.handlers[name]({preventDefault() {}}); }
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

test('teacher cloud sign-in, creation and sign-out preserve local profiles', async () => {
  const stored = new Map();
  globalThis.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  globalThis.document={...element(),createElement:element}; globalThis.window=element();
  const els=new Map(), rows=[], writes=[];
  const root={...element(),querySelector(id){if(!els.has(id))els.set(id,element());return els.get(id);}};
  const get=id=>root.querySelector('#'+id);
  const client={session:{user:{email:'teacher@example.test'}},async signIn(){},async signOut(){},async students(){return rows;},async rpc(name,p){
    if(name==='fact_pop_is_teacher')return true;
    if(name==='fact_pop_create_student'){const row={id:p.p_id,revision:0,progress:p.p_progress};rows.push(row);return row;}
    if(name==='fact_pop_save_progress'){writes.push(p);return {revision:p.p_revision+1};}
  }};
  const off=mountGame(root,{cloudClient:client});
  get('cloud-email').value='teacher@example.test';get('cloud-password').value='not-real';
  await get('cloud-login').fire('submit');
  assert.equal(get('cloud-who').textContent,'Teacher: teacher@example.test');
  assert.equal(get('start').disabled,true);
  assert.equal(get('cloud-password').value,'');
  get('new-student-name').value='Online child'; await get('add-student-form').fire('submit');
  assert.equal(get('student-name').value,'Online child');
  await get('cloud-signout').fire('click');
  assert.equal(get('student-name').value,'');
  assert.equal(JSON.parse(stored.get(PROFILES_KEY)).profiles.length,1);
  assert.ok(!stored.get(PROFILES_KEY).includes('Online child'));
  assert.equal(writes.length,1); off();
});

test('parent sees linked online profiles only and cannot use teacher controls', async () => {
  const stored=new Map([[STORAGE_KEY,JSON.stringify({...freshProgress(),student:'Teacher local student'})]]);
  globalThis.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  globalThis.document={...element(),createElement:element};globalThis.window=element();
  const els=new Map();const root={...element(),querySelector(id){if(!els.has(id))els.set(id,element());return els.get(id);}};
  const get=id=>root.querySelector('#'+id);
  const off=mountGame(root,{cloudClient:{session:{user:{email:'parent@example.test'}},async signIn(){},async signOut(){},async rpc(){return false;},async students(){return [{id:'child',revision:3,progress:{...freshProgress(),student:'Linked child'}}];}}});
  await get('cloud-login').fire('submit');
  assert.deepEqual(get('student-picker').children.map(x=>x.textContent),['Linked child']);
  assert.equal(get('cloud-teacher').hidden,true);
  assert.equal(get('add-student-form').hidden,true);
  assert.equal(get('reset-yes').disabled,true);
  assert.equal(get('import-file').disabled,true);
  off();
});
