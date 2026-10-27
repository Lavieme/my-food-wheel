import { candidates, ready, approved, reset, validatePlaces } from './decision.mjs';
export function failure(message,status=400){throw Object.assign(new Error(message),{status});}
const hex=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
export function randomInt(max){const range=4294967296,limit=range-range%max;let x;do{x=crypto.getRandomValues(new Uint32Array(1))[0];}while(x>=limit);return x%max;}
export function member(room,token){if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))failure('请通过邀请链接加入饭局',401);const m=room.members.find(m=>{if(m.token.length!==token.length)return false;let diff=0;for(let i=0;i<token.length;i++)diff|=m.token.charCodeAt(i)^token.charCodeAt(i);return diff===0;});if(!m)failure('你的参与身份已失效，请重新加入',401);return m;}
function newMember(name){return {id:hex(8),token:hex(24),name:String(name||'').trim().slice(0,16)||'吃饭搭子',avatar:randomInt(6),prefs:null,approved:false,confirmed:false,lastSeen:Date.now()};}
export function publicState(room,me,presence={}){return {code:room.code,title:room.title,solo:room.solo,stage:room.stage,revision:room.revision,round:room.round||0,createdAt:room.createdAt,completedAt:room.completedAt,hostId:room.hostId,places:room.places,rejected:room.rejected,candidates:candidates(room),result:room.result,spinAt:room.spinAt,feedback:room.feedback,me:{id:me.id,prefs:me.prefs},members:room.members.map(m=>({id:m.id,name:m.name,avatar:m.avatar,submitted:!!m.prefs,approved:m.approved,confirmed:m.confirmed,lastSeen:presence[m.id]||m.lastSeen})),notices:room.notices.slice(-5),ready:ready(room),canSpin:approved(room)};}
export function createRoom(b){let places;try{places=validatePlaces(b.places);}catch(e){failure(e.message);}const me=newMember(b.name);const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';const code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');const now=Date.now();return {room:{code,title:String(b.title||'今天一起吃什么').trim().slice(0,40)||'今天一起吃什么',solo:!!b.solo,hostId:me.id,stage:'collect',revision:1,round:0,createdAt:now,updatedAt:now,members:[me],places,rejected:[],result:null,spinAt:null,completedAt:null,feedback:null,notices:[]},me,events:[{type:'room_created',at:now,extra:{solo:!!b.solo}}]};}
export function perform(room,action,b,token){
 const events=[];const record=(type,extra={})=>events.push({type,at:Date.now(),extra});const change=type=>{room.revision++;room.updatedAt=Date.now();record(type);};
 if(action==='join'){
  if(b.token){try{const prior=member(room,b.token);return {room,me:prior,token:prior.token,events,unchanged:true};}catch(e){if(e.status!==401)throw e;}}
  if(room.solo||room.stage!=='collect')failure('这场饭局已开始选店，暂不接受新成员');if(room.members.length>=8)failure('饭局最多支持 8 人');
  const me=newMember(b.name);room.members.push(me);reset(room);change('member_joined');return {room,me,token:me.token,events};
 }
 const me=member(room,token);me.lastSeen=Date.now();const compatible=(action==='approve'&&b.round===(room.round||0))||(['confirm','reject'].includes(action)&&b.spinAt!=null&&b.spinAt===room.spinAt);
 if(b.revision!==room.revision&&!compatible)failure('饭局刚刚有更新，已为你同步，请确认后再操作',409);
 if(action==='preferences'){
  if(!['collect','candidates'].includes(room.stage))failure('结果已产生，请先提出异议再调整条件');const p=b.preferences;
  if(!p||!Number.isFinite(p.budget)||p.budget<0||p.budget>10000||!Array.isArray(p.excluded)||!Array.isArray(p.categories))failure('请填写有效预算和排除项');
  const ids=new Set(room.places.map(p=>p.id)),cats=new Set(room.places.map(p=>p.category));if(!p.excluded.every(id=>ids.has(id))||!p.categories.every(c=>cats.has(c)))failure('排除项不属于本次候选');
  me.prefs={budget:p.budget,excluded:[...new Set(p.excluded)],categories:[...new Set(p.categories)]};reset(room);if(ready(room))room.stage='candidates';change('preferences_submitted');
 }else if(action==='approve'){
  if(room.stage!=='candidates'||!ready(room)||!candidates(room).length)failure('请等待所有人提交条件，并确保存在共同候选');me.approved=true;change('pool_approved');
 }else if(action==='spin'){
  if(me.id!==room.hostId)failure('由发起人启动转盘',403);if(room.stage!=='candidates'||!approved(room))failure('请等待所有成员认可候选池');const pool=candidates(room);room.result=pool[randomInt(pool.length)];room.spinAt=Date.now();room.stage='result';change('result_generated');
 }else if(action==='confirm'){
  if(room.stage!=='result')failure('当前没有待确认的结果');if(Date.now()-room.spinAt<2800)failure('转盘正在停下，请稍候');me.confirmed=true;
  if(room.members.every(m=>m.confirmed)){room.stage='done';room.completedAt=Date.now();record('decision_completed',{durationMs:room.completedAt-room.createdAt});}change('result_confirmed');
 }else if(action==='reject'){
  if(room.stage!=='result')failure('当前结果已经更新');const reason=String(b.reason||'今天不合适').slice(0,80);room.notices.push({text:`${me.name} 对「${room.result.name}」提出异议：${reason}`,at:Date.now()});room.notices=room.notices.slice(-30);room.rejected.push(room.result.id);reset(room);if(ready(room))room.stage='candidates';record('rejection_reason',{reason});change('result_rejected');
 }else if(action==='restore'){
  if(!['collect','candidates'].includes(room.stage))failure('当前无法恢复候选');room.rejected=[];reset(room);if(ready(room))room.stage='candidates';change('rejected_restored');
 }else if(action==='leave'||action==='remove'){
  if(room.stage==='done')failure('已完成饭局保留原始参与记录');const target=action==='leave'?me.id:b.memberId;if(action==='remove'&&(me.id!==room.hostId||target===me.id))failure('仅发起人可移除其他成员',403);
  const old=room.members.find(m=>m.id===target);if(!old)failure('该成员已离开');room.members=room.members.filter(m=>m.id!==target);
  if(!room.members.length){record('room_closed');return {room,me,events,left:true,deleted:true};}if(target===room.hostId)room.hostId=room.members[0].id;room.notices.push({text:`${old.name} 已离开，请重新认可候选`,at:Date.now()});room.notices=room.notices.slice(-30);reset(room);if(ready(room))room.stage='candidates';change('member_left');if(action==='leave')return {room,me,events,left:true};
 }else if(action==='feedback'){
  if(room.stage!=='done'||me.id!==room.hostId)failure('完成决策后由发起人记录实际就餐',403);if(!['went','changed','cancelled'].includes(b.value))failure('反馈无效');room.feedback={value:b.value,at:Date.now()};record('feedback_value',{value:b.value});change('meal_feedback');
 }else failure('操作不存在',404);
 return {room,me,events};
}
