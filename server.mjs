import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { candidates, ready, approved, reset, validatePlaces } from './lib/decision.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'food-wheel.json');
let db = { rooms: {}, events: [] };
if (fs.existsSync(dbFile)) db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
function save() { const temp = dbFile + '.tmp'; fs.writeFileSync(temp, JSON.stringify(db, null, 2)); fs.renameSync(temp, dbFile); }
function event(type, room, extra = {}) { db.events.push({ type, room: room.code, at: Date.now(), ...extra }); db.events = db.events.slice(-20000); }
function change(room, type, extra) { room.revision++; room.updatedAt = Date.now(); event(type, room, extra); save(); }
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function safeEqual(a,b) { return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
function memberFor(room, token) { const m = room.members.find(m => safeEqual(m.token, token)); if (!m) fail('你的参与身份已失效，请重新加入',401); return m; }
function state(room, me) {
  return { code: room.code, title: room.title, solo: room.solo, stage: room.stage, revision: room.revision, round: room.round || 0, createdAt: room.createdAt, completedAt: room.completedAt, hostId: room.hostId, places: room.places, rejected: room.rejected, candidates: candidates(room), result: room.result, spinAt: room.spinAt, feedback: room.feedback, me: { id: me.id, prefs: me.prefs }, members: room.members.map(m => ({ id:m.id,name:m.name,avatar:m.avatar,submitted:!!m.prefs,approved:m.approved,confirmed:m.confirmed,lastSeen:m.lastSeen })), notices: room.notices.slice(-5), ready:ready(room), canSpin:approved(room) };
}
function newMember(name) { return { id:randomBytes(8).toString('hex'), token:randomBytes(24).toString('hex'), name:String(name || '').trim().slice(0,16) || '吃饭搭子', avatar:randomInt(6), prefs:null, approved:false, confirmed:false,lastSeen:Date.now() }; }
async function body(req) {
  let s=''; for await (const chunk of req) { s+=chunk; if (Buffer.byteLength(s)>100000) fail('请求内容过大',413); }
  try { return s ? JSON.parse(s) : {}; } catch { fail('请求格式无效'); }
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (data,status=200) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data)); };
  try {
    // JSON API is same-origin; never expose data files or legacy source through arbitrary paths.
    if (url.pathname.startsWith('/api/')) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail('不支持跨站请求',403);
      if (url.pathname === '/api/info' && req.method==='GET') {
        const port=server.address().port; const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}`);
        return json({addresses});
      }
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        const b=await body(req); let places; try { places=validatePlaces(b.places); } catch(e) { fail(e.message); } const me=newMember(b.name);
        let code; do {code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();} while(db.rooms[code]);
        const room={ code,title:String(b.title||'今天一起吃什么').trim().slice(0,40)||'今天一起吃什么',solo:!!b.solo,hostId:me.id,stage:'collect',revision:1,createdAt:Date.now(),updatedAt:Date.now(),members:[me],places,rejected:[],result:null,spinAt:null,completedAt:null,feedback:null,notices:[] };
        db.rooms[code]=room;event('room_created',room,{solo:room.solo});save();return json({token:me.token,room:state(room,me)},201);
      }
      const match=url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(\w+))?$/);
      if (!match) fail('接口不存在',404);
      const room=db.rooms[match[1]]; if (!room) fail('没有找到这个饭局，请检查房间码',404);
      const action=match[2];
      if(action==='join'&&req.method==='POST') {
        const b=await body(req);
        const prior=room.members.find(m=>safeEqual(m.token,b.token)); if(prior) return json({token:prior.token,room:state(room,prior)});
        if(room.solo||room.stage!=='collect') fail('这场饭局已开始选店，暂不接受新成员');
        if(room.members.length>=8) fail('饭局最多支持 8 人');
        const me=newMember(b.name);room.members.push(me);reset(room);change(room,'member_joined');return json({token:me.token,room:state(room,me)});
      }
      const me=memberFor(room,req.headers['x-member-token']);
      if(req.method==='GET'&&!action) {me.lastSeen=Date.now(); return json(state(room,me));}
      if(req.method!=='POST') fail('请求方法无效',405);
      const b=await body(req);me.lastSeen=Date.now();
      const compatible = (action === 'approve' && b.round === (room.round || 0)) || (['confirm','reject'].includes(action) && b.spinAt != null && b.spinAt === room.spinAt);
      if (b.revision !== room.revision && !compatible) fail('饭局刚刚有更新，已为你同步，请确认后再操作',409);
      if(action==='preferences') {
        if(!['collect','candidates'].includes(room.stage)) fail('结果已产生，请先提出异议再调整条件');
        const p=b.preferences;
        if(!p||!Number.isFinite(p.budget)||p.budget<0||p.budget>10000||!Array.isArray(p.excluded)||!Array.isArray(p.categories)) fail('请填写有效预算和排除项');
        const ids=new Set(room.places.map(p=>p.id)); const cats=new Set(room.places.map(p=>p.category));
        if(!p.excluded.every(id=>ids.has(id))||!p.categories.every(c=>cats.has(c))) fail('排除项不属于本次候选');
        me.prefs={budget:p.budget,excluded:[...new Set(p.excluded)],categories:[...new Set(p.categories)]};reset(room);
        if(ready(room)) room.stage='candidates'; change(room,'preferences_submitted');
      } else if(action==='approve') {
        if(room.stage!=='candidates'||!ready(room)||!candidates(room).length) fail('请等待所有人提交条件，并确保存在共同候选');
        me.approved=true;change(room,'pool_approved');
      } else if(action==='spin') {
        if(me.id!==room.hostId) fail('由发起人启动转盘',403);
        if(room.stage!=='candidates'||!approved(room)) fail('请等待所有成员认可候选池');
        const pool=candidates(room);room.result=pool[randomInt(pool.length)];room.spinAt=Date.now();room.stage='result';change(room,'result_generated');
      } else if(action==='confirm') {
        if(room.stage!=='result') fail('当前没有待确认的结果');
        if(Date.now()-room.spinAt<2800) fail('转盘正在停下，请稍候');
        me.confirmed=true;
        if(room.members.every(m=>m.confirmed)) {room.stage='done';room.completedAt=Date.now();event('decision_completed',room,{durationMs:room.completedAt-room.createdAt});}
        change(room,'result_confirmed');
      } else if(action==='reject') {
        if(room.stage!=='result') fail('当前结果已经更新');
        const reason=String(b.reason||'今天不合适').slice(0,80);
        room.notices.push({text:`${me.name} 对「${room.result.name}」提出异议：${reason}`,at:Date.now()});
        room.rejected.push(room.result.id);reset(room);if(ready(room)) room.stage='candidates';change(room,'result_rejected',{reason});
      } else if(action==='restore') {
        if(!['collect','candidates'].includes(room.stage)) fail('当前无法恢复候选');
        room.rejected=[];reset(room);if(ready(room)) room.stage='candidates';change(room,'rejected_restored');
      } else if(action==='leave'||action==='remove') {
        if(room.stage==='done') fail('已完成饭局保留原始参与记录');
        const target=action==='leave'?me.id:b.memberId;
        if(action==='remove'&&(me.id!==room.hostId||target===me.id)) fail('仅发起人可移除其他成员',403);
        const old=room.members.find(m=>m.id===target);if(!old) fail('该成员已离开');
        room.members=room.members.filter(m=>m.id!==target);
        if(!room.members.length) {delete db.rooms[room.code];event('room_closed',room);save();return json({left:true});}
        if(target===room.hostId) room.hostId=room.members[0].id;
        room.notices.push({text:`${old.name} 已离开，请重新认可候选`,at:Date.now()});reset(room);if(ready(room))room.stage='candidates';change(room,'member_left');
        if(action==='leave')return json({left:true});
      } else if(action==='feedback') {
        if(room.stage!=='done'||me.id!==room.hostId) fail('完成决策后由发起人记录实际就餐',403);
        if(!['went','changed','cancelled'].includes(b.value))fail('反馈无效');
        room.feedback={value:b.value,at:Date.now()};change(room,'meal_feedback',{value:b.value});
      } else fail('操作不存在',404);
      return json(state(room,me));
    }
    if(url.pathname==='/config.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});return res.end("window.FOOD_WHEEL_CONFIG={mode:'local',apiOrigin:''};");}
    const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/config.js':'config.js','/lib/wheel-layout.mjs':'lib/wheel-layout.mjs','/style.css':'style.css','/legacy/':'legacy/index.html'};
    const file=assets[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
    const mime=(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
    res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(fs.readFileSync(path.join(root,file)));
  }catch(e){if(!res.headersSent)json({error:e.status?e.message:'本地服务发生错误，请稍后重试'},e.status||500);else res.end();if(!e.status)console.error(e);}
});
const port=Number(process.env.PORT||4173);
server.listen(port,process.env.HOST||'0.0.0.0',()=>{console.log(`食光转盘已启动：http://localhost:${server.address().port}`);for(const x of Object.values(os.networkInterfaces()).flat())if(x?.family==='IPv4'&&!x.internal)console.log(`同一局域网加入：http://${x.address}:${server.address().port}`);});
