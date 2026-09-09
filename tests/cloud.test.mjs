import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudClient, CloudSaves} from '../cloud.js';
import {freshProgress} from '../engine.js';

test('online writes serialize revisions and snapshot progress', async () => {
  const calls = [];
  const saves = new CloudSaves({async rpc(name, payload) { calls.push(payload); return {revision: payload.p_revision + 1}; }});
  saves.register({id:'a', revision:4});
  const p = freshProgress(); p.xp=100; saves.save('a', p); p.xp=200; saves.save('a',p);
  assert.equal(saves.dirty,true);
  assert.equal(await saves.flush(),true);
  assert.deepEqual(calls.map(p=>[p.p_revision,p.p_progress.xp]), [[4,100],[5,200]]);
});
test('conflicting or ambiguous saves stop without overwriting or claiming success', async () => {
  let calls=0;
  const saves=new CloudSaves({async rpc() {calls++; throw Error('conflict');}});
  saves.register({id:'a',revision:0});
  saves.save('a',freshProgress()); saves.save('a',freshProgress());
  assert.equal(await saves.flush(),false);
  assert.equal(calls,1); assert.equal(saves.failed,true);
});
test('students save independently and refresh registers a new revision', async () => {
  const saves=new CloudSaves({async rpc(name,p) {if(p.p_student_id==='a') throw Error('offline'); return {revision:1};}});
  saves.register({id:'a',revision:0}); saves.register({id:'b',revision:0});
  saves.save('a',freshProgress()); saves.save('b',freshProgress()); await saves.flush();
  assert.equal(saves.entries.get('b').pending,0);
  saves.register({id:'a',revision:2}); assert.equal(saves.dirty,false);
});
test('browser client sends publishable key and expires auth only in memory', async () => {
  const requests=[];
  const client=new CloudClient({url:'https://example.supabase.co',key:'sb_publishable_test'},async (url,options) => {
    requests.push({url,options});
    return {ok:true,async text(){return JSON.stringify(url.includes('/token?') ? {access_token:'test',refresh_token:'refresh',expires_in:3600,user:{id:'u'}} : []);}};
  });
  await client.signIn('teacher@example.test','test-only');
  await client.students();
  assert.equal(requests[1].options.headers.Authorization,'Bearer test');
  assert.equal(requests[1].options.headers.apikey,'sb_publishable_test');
  await client.signOut(); assert.equal(client.session,null);
  await assert.rejects(client.students(),/Sign in/);
});

test('default browser fetch is called with the global receiver', async () => {
  const previous=globalThis.fetch;
  globalThis.fetch=function(){ assert.equal(this,globalThis); return Promise.resolve({ok:true,text:async()=> 'null'}); };
  try { await new CloudClient({url:'https://example.supabase.co',key:'public'}).request('/health'); }
  finally {globalThis.fetch=previous;}
});
