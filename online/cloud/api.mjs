import { createRoom, perform, publicState, member, failure } from '../lib/room-service.mjs';
export const PUBLIC_FRONTEND='https://lavieme.github.io/my-food-wheel/';
const ALLOWED_FRONTEND_ORIGIN=new URL(PUBLIC_FRONTEND).origin;
const TTL=30*86400000;
const codePattern=/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(\w+))?$/;
async function readBody(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))failure('请发送 JSON 请求',415);
 const reader=request.body?.getReader();if(!reader)return {};let size=0,s='';const decoder=new TextDecoder();
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();failure('请求内容过大',413);}s+=decoder.decode(value,{stream:true});}s+=decoder.decode();
 try{const b=JSON.parse(s||'{}');if(!b||typeof b!=='object'||Array.isArray(b))failure('请求格式无效');return b;}catch(e){if(e.status)throw e;failure('请求格式无效');}
}
export async function handleApi(request,db,ctx={waitUntil:()=>{}}){
 const url=new URL(request.url),origin=request.headers.get('origin');const allowed=origin===url.origin||origin===ALLOWED_FRONTEND_ORIGIN;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(allowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, X-Member-Token';headers['Access-Control-Max-Age']='600';}
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  if(origin&&!allowed)failure('不支持跨站请求',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(request.method))failure('请求方法无效',405);
  if(url.pathname==='/api/info'&&request.method==='GET')return json({mode:'online',addresses:[],inviteOrigin:PUBLIC_FRONTEND,storage:'persistent',version:'2.2.0'});
  if(!db)failure('在线服务尚未配置数据库',503);
  const now=Date.now();
  if(Math.random()<0.02)ctx.waitUntil(db.batch([db.prepare('DELETE FROM fw_limits WHERE id IN (SELECT id FROM fw_limits WHERE expires_at<? LIMIT 100)').bind(now),db.prepare('DELETE FROM fw_rooms WHERE code IN (SELECT code FROM fw_rooms WHERE expires_at<? LIMIT 20)').bind(now),db.prepare('DELETE FROM fw_events WHERE id IN (SELECT id FROM fw_events WHERE at<? LIMIT 200)').bind(now-TTL)]).catch(()=>{}));
  // Hash daily network identifiers. No raw visitor IP is persisted.
  const ip=request.headers.get('cf-connecting-ip');
  if(ip){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`food-wheel-v2:${ip}:${Math.floor(now/86400000)}`));const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');const bucket=url.pathname==='/api/rooms'?'create':request.method==='GET'?'read':'write';const key=`${hash}:${bucket}:${Math.floor(now/60000)}`;const limit=bucket==='create'?20:bucket==='read'?360:180;const rate=await db.prepare('INSERT INTO fw_limits (id, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first();if(rate.count>limit)failure('操作有点频繁，请稍后再试',429);}
  if(url.pathname==='/api/rooms'&&request.method==='POST'){
   const b=await readBody(request);for(let i=0;i<5;i++){
    const created=createRoom(b),room=created.room;
    const insert=await db.prepare('INSERT OR IGNORE INTO fw_rooms (code,data,revision,expires_at) VALUES (?,?,?,?)').bind(room.code,JSON.stringify(room),room.revision,now+TTL).run();
    if(!insert.meta.changes)continue;
    await saveEvents(db,room.code,created.events);return json({token:created.me.token,room:publicState(room,created.me)},201);
   }failure('暂时无法创建饭局，请重试',503);
  }
  const match=url.pathname.match(codePattern);if(!match)failure('接口不存在',404);const code=match[1],action=match[2],token=request.headers.get('x-member-token');
  if(request.method==='GET'&&!action){
   const row=await db.prepare('SELECT data FROM fw_rooms WHERE code=? AND expires_at>?').bind(code,now).first();if(!row)failure('饭局不存在或已超过 30 天，请检查房间码',404);const room=JSON.parse(row.data),me=member(room,token);
   await db.prepare('INSERT INTO fw_presence (room_code,member_id,last_seen) VALUES (?,?,?) ON CONFLICT(room_code,member_id) DO UPDATE SET last_seen=excluded.last_seen').bind(code,me.id,now).run();
   const rows=await db.prepare('SELECT member_id,last_seen FROM fw_presence WHERE room_code=?').bind(code).all();const presence=Object.fromEntries(rows.results.map(r=>[r.member_id,r.last_seen]));return json(publicState(room,me,presence));
  }
  if(request.method!=='POST'||!action)failure('请求方法无效',405);const b=await readBody(request);
  for(let attempt=0;attempt<4;attempt++){
   const row=await db.prepare('SELECT data,revision FROM fw_rooms WHERE code=? AND expires_at>?').bind(code,now).first();if(!row)failure('饭局不存在或已超过 30 天，请检查房间码',404);const room=JSON.parse(row.data);const next=perform(room,action,b,token);
   if(next.unchanged)return json({token:next.token,room:publicState(room,next.me)});
   const write=next.deleted?db.prepare('DELETE FROM fw_rooms WHERE code=? AND revision=?').bind(code,row.revision):db.prepare('UPDATE fw_rooms SET data=?,revision=?,expires_at=? WHERE code=? AND revision=?').bind(JSON.stringify(room),room.revision,now+TTL,code,row.revision);
   const result=await write.run();if(!result.meta.changes)continue;
   await saveEvents(db,code,next.events);
   if(next.left)return json({left:true});
   return json(action==='join'?{token:next.token,room:publicState(room,next.me)}:publicState(room,next.me));
  }failure('饭局正在更新，请稍后重试',409);
 }catch(e){if(!e.status)console.error('Food wheel API error:',e.message);return json({error:e.status?e.message:'在线服务暂时繁忙，请稍后重试'},e.status||503);}
}
async function saveEvents(db,code,events){
 try{if(events.length)await db.batch(events.map(e=>db.prepare('INSERT INTO fw_events (id,room_code,type,at,extra) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),code,e.type,e.at,JSON.stringify(e.extra))));}catch(e){console.warn('Event logging failed:',e.message);}
}
