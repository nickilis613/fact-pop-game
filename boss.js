import { status, operationSymbol, hint, shuffle } from './engine.js';

export const BOSSES = [
  { name: 'Jelly Slime', icon: '🟢', hp: 60, color: '#89d7af', title: 'Your first little challenger.' },
  { name: 'Moon Bat', icon: '🦇', hp: 80, color: '#b6a0ef', title: 'Your skills are ready to take flight.' },
  { name: 'Mossy Ogre', icon: '👹', hp: 100, color: '#93b870', title: 'Bigger skills. Bigger adventures.' },
  { name: 'Ember Dragon', icon: '🐉', hp: 120, color: '#e97946', title: 'A legendary challenge for your fluent facts.' },
];
export function bossFor(fluent, total) {
  return BOSSES[Math.min(3, Math.floor(Math.max(0, fluent) / Math.max(1, total) * 4))];
}
export class BossBattle {
  constructor(boss, facts, rng = Math.random) {
    if (!facts.length) throw Error('Choose at least one fact.');
    this.boss = boss; this.hp = boss.hp; this.facts = facts; this.rng = rng;
    this.hits = 0; this.attempts = 0; this.guided = false; this.waiting = false;
    this.deck = []; this.next();
  }
  next() {
    if (!this.hp) return;
    if (!this.deck.length) this.deck = shuffle(this.facts, this.rng);
    if (this.deck.length > 1 && this.deck.at(-1)?.key === this.question?.key) this.deck.unshift(this.deck.pop());
    this.question = this.deck.pop(); this.waiting = false; this.guided = false;
  }
  submit(raw) {
    if (!this.hp || this.waiting || !/^\d{1,3}$/.test(String(raw))) return null;
    this.attempts++;
    if (Number(raw) !== this.question.answer) { this.guided = true; return { correct: false, damage: 0 }; }
    const damage = Math.min(this.hp, this.guided ? 10 : 20);
    this.hp -= damage; this.hits++; this.waiting = true;
    return { correct: true, damage, won: this.hp === 0 };
  }
}

export function mountBoss(root, context) {
  const $ = id => root.querySelector('#' + id);
  const dialog = $('boss-dialog');
  if (!dialog?.showModal) return { update() {}, destroy() {} };
  let battle, testing = false;
  const listeners = [];
  const on = (id, event, fn) => { $(id).addEventListener(event, fn); listeners.push(() => $(id).removeEventListener(event, fn)); };
  function current() {
    const c = context();
    const fluent = c.facts.filter(f => status(c.data.facts[f.key]) === 'secure').length;
    return { ...c, fluent, boss: bossFor(fluent, c.facts.length) };
  }
  function update() {
    const c = current();
    $('boss-preview').textContent = c.boss.icon;
    $('boss-preview-name').textContent = c.boss.name;
    $('boss-unlock').textContent = c.rounds >= 3 ? 'Dailies complete. Your fourth round is ready!' : `Complete ${3 - c.rounds} more daily ${c.rounds === 2 ? 'round' : 'rounds'} to unlock.`;
    $('boss-fluency').textContent = `${c.fluent} / ${c.facts.length} fluent facts · more fluency, stronger bosses`;
    $('boss-start').disabled = c.rounds < 3 || c.busy;
    $('boss-test').disabled = c.busy;
    $('boss-result-start').hidden = c.rounds < 3;
    $('boss-result-start').disabled = c.busy;
  }
  function begin(test) {
    const c = current();
    if (c.busy || (!test && c.rounds < 3)) return;
    testing = test;
    $('boss-lab').hidden = !test;
    $('boss-mode').textContent = test ? 'PLAYTEST · ROUND 04' : 'BONUS · ROUND 04';
    const selected = test && $('boss-tier').value !== 'auto' ? BOSSES[Number($('boss-tier').value)] : c.boss;
    const facts = c.facts.filter(f => (!f.operation || c.settings.operation === 'mixed' || f.operation === c.settings.operation) && (c.settings.tables.includes(f.operation === '−' ? f.answer : f.a) || c.settings.tables.includes(f.b)));
    battle = new BossBattle(selected, facts);
    $('boss-name').textContent = selected.name;
    $('boss-creature').textContent = selected.icon;
    $('boss-creature').classList.toggle('is-slime', selected === BOSSES[0]);
    dialog.style.setProperty('--boss-color', selected.color);
    $('boss-subtitle').textContent = selected.title;
    $('boss-victory').hidden = true; $('boss-combat').hidden = false;
    $('boss-feedback').textContent = '20 damage per correct answer. No timer. No lost lives.';
    render();
    if (!dialog.open) dialog.showModal();
    $('boss-answer').focus();
  }
  function render() {
    $('boss-health').max = battle.boss.hp; $('boss-health').value = battle.hp;
    $('boss-hp').textContent = `${battle.hp} / ${battle.boss.hp} HP`;
    $('boss-equation').textContent = `${battle.question.a} ${operationSymbol(battle.question)} ${battle.question.b} = ?`;
    $('boss-answer').value = ''; $('boss-answer').disabled = battle.waiting;
    $('boss-attack').disabled = battle.waiting; $('boss-next').hidden = !battle.waiting;
    $('boss-creature').classList.remove('boss-hit');
  }
  on('boss-start', 'click', () => begin(false));
  on('boss-result-start', 'click', () => begin(false));
  on('boss-test', 'click', () => begin(true));
  on('boss-tier', 'change', () => begin(true));
  on('boss-close', 'click', () => dialog.close());
  on('boss-again', 'click', () => begin(testing));
  on('boss-next', 'click', () => { battle.next(); render(); $('boss-feedback').textContent = 'Keep going! Every fact makes a difference.'; $('boss-answer').focus(); });
  on('boss-form', 'submit', event => {
    event.preventDefault();
    const result = battle?.submit($('boss-answer').value.trim());
    if (!result) return;
    render();
    if (!result.correct) {
      const q = battle.question;
      $('boss-feedback').textContent = `${q.a} ${operationSymbol(q)} ${q.b} = ${q.answer}. ${hint(q.a, q.b, operationSymbol(q))} Type ${q.answer} to deal 10 practice damage.`;
      $('boss-answer').focus();
    } else {
      $('boss-creature').classList.add('boss-hit');
      $('boss-feedback').textContent = `Direct hit! −${result.damage} HP.`;
      if (result.won) {
        $('boss-combat').hidden = true; $('boss-victory').hidden = false;
        $('boss-subtitle').textContent = 'Boss defeated. Your facts have power!';
        $('boss-win-stats').textContent = `${battle.hits} hits · ${battle.boss.hp} damage · nicely done!`;
        $('boss-again').focus();
      } else $('boss-next').focus();
    }
  });
  return { update, destroy() { if (dialog.open) dialog.close(); listeners.forEach(off => off()); } };
}
