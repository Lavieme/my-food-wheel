import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleApi,PUBLIC_FRONTEND} from '../cloud/api.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE fw_rooms(code TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL,expires_at INTEGER NOT NULL);CREATE TABLE fw_presence(room_code TEXT,member_id TEXT,last_seen INTEGER,PRIMARY KEY(room_code,member_id));CREATE TABLE fw_events(id TEXT PRIMARY KEY,room_code TEXT,type TEXT,at INTEGER,extra TEXT);CREATE TABLE fw_limits(id TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);`);
 const api={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}};}};}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const stmt of statements)r.push(await stmt.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {api,sql};
}
const places=[{id:'a',name:'测试面馆',price:26,category:'面食'},{id:'b',name:'测试火锅',price:80,category:'火锅'},{id:'c',name:'测试家常菜',price:38,category:'家常菜'}];
test('在线 API：GitHub跨域、持久化、并发认可和并发确认不丢失成员状态',async()=>{
 const {api:db,sql}=database();
 async function request(path,body,token,origin='https://lavieme.github.io'){
  const req=new Request('https://wheel.example'+path,{method:body===undefined?'GET':'POST',headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{'x-member-token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const res=await handleApi(req,db);return {res,data:await res.json()};
 }
 let r=await request('/api/info');assert.equal(r.data.mode,'online');assert.equal(r.data.inviteOrigin,PUBLIC_FRONTEND);assert.equal(r.res.headers.get('access-control-allow-origin'),'https://lavieme.github.io');
 const options=await handleApi(new Request('https://wheel.example/api/rooms',{method:'OPTIONS',headers:{origin:'https://lavieme.github.io','access-control-request-method':'POST'}}),db);assert.equal(options.status,204);
 assert.equal((await request('/api/info',undefined,undefined,'https://evil.example')).res.status,403);
 const create=await request('/api/rooms',{name:'甲',title:'线上测试',places});assert.equal(create.res.status,201);const code=create.data.room.code,host=create.data.token;
 const join=await request(`/api/rooms/${code}/join`,{name:'乙'});assert.equal(join.res.status,200);const guest=join.data.token;
 const state=async token=>(await request(`/api/rooms/${code}`,undefined,token)).data;
 const act=async(action,body,token)=>{const now=await state(token);return request(`/api/rooms/${code}/${action}`,{...body,revision:now.revision,round:now.round,spinAt:now.spinAt},token);};
 assert.equal((await request(`/api/rooms/${code}`)).res.status,401);
 await act('preferences',{preferences:{budget:100,excluded:[],categories:[]}},host);
 r=await act('preferences',{preferences:{budget:40,excluded:[],categories:[]}},guest);assert.equal(r.data.candidates.length,2);assert.ok(r.data.members.every(m=>!m.prefs&&!m.token));
 const shared=await state(host);const approvals=await Promise.all([host,guest].map(token=>request(`/api/rooms/${code}/approve`,{revision:shared.revision,round:shared.round},token)));assert.ok(approvals.every(r=>r.res.status===200));assert.equal((await state(host)).canSpin,true);
 r=await act('spin',{},host);assert.equal(r.data.stage,'result');assert.ok(r.data.result.price<=40);assert.equal((await act('spin',{},guest)).res.status,403);
 await new Promise(resolve=>setTimeout(resolve,2850));
 const result=await state(host);const confirms=await Promise.all([host,guest].map(token=>request(`/api/rooms/${code}/confirm`,{revision:result.revision,spinAt:result.spinAt},token)));assert.ok(confirms.every(r=>r.res.status===200));const completed=await state(guest);assert.equal(completed.stage,'done');assert.ok(completed.members.every(m=>m.confirmed));
 assert.equal((await act('feedback',{value:'went'},guest)).res.status,403);await act('feedback',{value:'went'},host);assert.equal((await state(guest)).feedback.value,'went');
 const stored=JSON.parse(sql.prepare('SELECT data FROM fw_rooms WHERE code=?').get(code).data);assert.equal(stored.stage,'done');assert.equal(sql.prepare("SELECT count(*) as n FROM fw_events WHERE type='decision_completed'").get().n,1);sql.close();
});
test('在线 API：请求大小、格式、非JSON提交与速率保护',async()=>{
 const {api:db,sql}=database();const url='https://wheel.example/api/rooms';
 assert.equal((await handleApi(new Request(url,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'}),db)).status,415);
 assert.equal((await handleApi(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:'null'}),db)).status,400);
 assert.equal((await handleApi(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'x'.repeat(110000)})}),db)).status,413);
 for(let i=0;i<20;i++)await handleApi(new Request(url,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({places})}),db);
 assert.equal((await handleApi(new Request(url,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({places})}),db)).status,429);sql.close();
});
