import test from 'node:test';
import assert from 'node:assert/strict';
import { mountGame } from '../game.js';
import { PROFILES_KEY } from '../profiles.js';
import { STORAGE_KEY, freshProgress, FACTS } from '../engine.js';

function element() {
  return {value: '', hidden: false, style: {}, dataset: {}, handlers: {}, attributes: {}, innerHTML: '',
    addEventListener(name, fn) { this.handlers[name] = fn; }, removeEventListener() {},
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute() {}, focus() {}, scrollIntoView() {},
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

test('daily tracker fills three rounds, retains totals on reload, and starts fresh for a new student', async () => {
  const stored = new Map();
  globalThis.localStorage = {getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value)};
  globalThis.document = {...element(), createElement: element};
  globalThis.window = element();
  function mount() {
    const els = new Map();
    const steps = Array.from({length: 3}, element);
    const root = {...element(), querySelector(id) {
      if (!els.has(id)) els.set(id, element());
      return els.get(id);
    }};
    root.querySelector('#daily-ticker').querySelectorAll = () => steps;
    const off = mountGame(root);
    return {get: id => root.querySelector('#' + id), steps, off};
  }
  let ui = mount();
  try {
    assert.equal(ui.get('daily-rounds').textContent, '0 / 3');
    for (let rounds = 1; rounds <= 3; rounds++) {
      await ui.get(rounds === 1 ? 'start' : 'replay').fire('click');
      for (let question = 0; question < 12; question++) {
        const [a, b] = ui.get('equation').innerHTML.match(/\d+/g).map(Number);
        ui.get('answer').value = String(a * b);
        ui.get('answer-form').fire('submit');
        ui.get('next').fire('click');
      }
      assert.equal(ui.get('daily-rounds').textContent, `${rounds} / 3`);
      assert.equal(ui.get('daily-xp').textContent, (rounds * 1300).toLocaleString());
      assert.equal(Number(ui.get('daily-streak').textContent), rounds * 12);
      assert.equal(ui.steps.filter(step => step.textContent === '✓').length, rounds);
    }
    assert.match(ui.get('daily-message').textContent, /goal reached/);
    assert.match(ui.get('result-daily').textContent, /3 rounds/);
    ui.off();
    ui = mount();
    assert.equal(ui.get('daily-rounds').textContent, '3 / 3');
    assert.equal(ui.get('daily-xp').textContent, (3900).toLocaleString());
    assert.equal(Number(ui.get('daily-best').textContent), 36);
    ui.get('new-student-name').value = 'Another student';
    ui.get('add-student-form').fire('submit');
    assert.equal(ui.get('daily-rounds').textContent, '0 / 3');
    assert.equal(ui.get('daily-xp').textContent, '0');
    assert.equal(Number(ui.get('daily-best').textContent), 0);
  } finally {
    ui.off();
  }
});

test('My facts counts fluent records and animates on entry, with independent student totals and reduced motion', () => {
  function progress(fluent) {
    const data = freshProgress();
    data.nextMission = 2;
    for (const fact of FACTS.slice(0, fluent)) data.facts[fact.key] = {
      attempts: 3, correct: 3, typed: 3, typedCorrect: 3,
      lastSeen: 100, lastCorrect: true,
      recent: [1, 1, 2].map(mission => ({correct: true, ms: 1500, mission, paused: false})),
    };
    return data;
  }
  const half = progress(34);
  half.facts[FACTS[33].key].recent[2].ms = 4000;
  const stored = new Map([[PROFILES_KEY, JSON.stringify({version: 1, active: 'half', profiles: [
    {id: 'half', progress: half}, {id: 'all', progress: progress(66)}, {id: 'new', progress: freshProgress()},
  ]})]]);
  globalThis.localStorage = {getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value)};
  globalThis.document = {...element(), createElement: element};
  let reducedMotion = false;
  globalThis.window = {...element(), matchMedia: () => ({matches: reducedMotion})};
  const els = new Map(), animations = [];
  const root = {...element(), contains: () => true, querySelector(id) {
    if (!els.has(id)) els.set(id, element());
    return els.get(id);
  }};
  const get = id => root.querySelector('#' + id);
  get('fluency-fill').animate = (frames, options) => {
    const animation = {frames, options, cancelled: false, cancel() {this.cancelled = true;}};
    animations.push(animation);
    return animation;
  };
  const off = mountGame(root);
  const navigate = page => {
    const button = {...element(), dataset: {page}, closest() {return this;}};
    root.handlers.click({target: button});
  };
  try {
    assert.equal(animations.length, 0);
    navigate('facts');
    assert.equal(get('fluency-count').textContent, '33 / 66');
    assert.equal(get('fluency-percent').textContent, '50%');
    assert.equal(get('fluency-progress').attributes['aria-valuenow'], '33');
    assert.equal(get('fluency-progress').attributes['aria-valuetext'], '33 of 66 facts feeling fluent');
    assert.equal(get('fluency-fill').style.transform, 'scaleX(0.5)');
    assert.deepEqual(animations[0].frames, [{transform: 'scaleX(0)'}, {transform: 'scaleX(0.5)'}]);
    navigate('play');
    assert.equal(animations[0].cancelled, true);
    navigate('facts');
    assert.equal(animations.length, 2);
    get('student-picker').value = 'all';
    get('student-picker').fire('change');
    assert.equal(animations[1].cancelled, true);
    assert.equal(get('fluency-count').textContent, '66 / 66');
    assert.equal(get('fluency-percent').textContent, '100%');
    assert.equal(get('fluency-fill').style.transform, 'scaleX(1)');
    reducedMotion = true;
    navigate('play'); navigate('facts');
    assert.equal(animations.length, 2);
    assert.equal(get('fluency-fill').style.transform, 'scaleX(1)');
    get('student-picker').value = 'new';
    get('student-picker').fire('change');
    assert.equal(get('fluency-count').textContent, '0 / 66');
    assert.equal(get('fluency-percent').textContent, '0%');
    assert.equal(get('fluency-fill').style.transform, 'scaleX(0)');
    assert.equal(get('fluency-progress').attributes['aria-valuenow'], '0');
  } finally { off(); }
});

test('subject switch preserves answers and settings, changes facts and restores direct addition page', async () => {
  const stored = new Map();
  globalThis.localStorage = {getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v)};
  globalThis.document = {...element(), createElement: element};
  globalThis.window = {...element(), location: {search:'',href:'http://localhost/'}, history:{replaceState(a,b,url){window.location={search:url.search,href:url.href};}}};
  const mount = () => {
    const els=new Map();
    const root={...element(),querySelector(id){if(!els.has(id))els.set(id,element());return els.get(id);}};
    return {get:id=>root.querySelector('#'+id),off:mountGame(root)};
  };
  let ui=mount();
  try {
    await ui.get('start').fire('click');
    let [a,b]=ui.get('equation').innerHTML.match(/\d+/g).map(Number);
    ui.get('answer').value=String(a*b); ui.get('answer-form').fire('submit');
    await ui.get('subject-switch').fire('click');
    assert.match(window.location.search,/practice=addition/);
    assert.equal(ui.get('secure-count').textContent,'0 / 126');
    assert.equal(ui.get('setup').hidden,false);
    assert.equal((ui.get('table-picker').innerHTML.match(/data-table=/g)||[]).length,9);
    ui.get('operation-picker').value='−'; ui.get('operation-picker').fire('change');
    await ui.get('start').fire('click');
    assert.match(ui.get('equation').attributes['aria-label'],/minus/);
    [a,b]=ui.get('equation').innerHTML.match(/\d+/g).map(Number);
    ui.get('answer').value=String(a-b); ui.get('answer-form').fire('submit');
    assert.match(ui.get('feedback').innerHTML,/Correct/);
    await ui.get('subject-switch').fire('click');
    assert.equal(ui.get('secure-count').textContent,'0 / 66');
    assert.equal(ui.get('total-xp').textContent,'200');
    await ui.get('subject-switch').fire('click');
    ui.off(); ui=mount();
    assert.equal(ui.get('operation-picker').value,'−');
    assert.equal(ui.get('total-xp').textContent,'200');
    const progress=JSON.parse(stored.get(PROFILES_KEY)).profiles[0].progress;
    assert.equal(Object.keys(progress.facts).length,2);
    assert.ok(Object.keys(progress.facts).some(k=>k.includes('x')));
    assert.ok(Object.keys(progress.facts).some(k=>k.includes('-')));
  } finally {ui.off();}
});
