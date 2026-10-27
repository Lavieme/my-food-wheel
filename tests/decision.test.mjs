import test from 'node:test';
import assert from 'node:assert/strict';
import {candidates,ready,approved,reset,validatePlaces} from '../lib/decision.mjs';
const places=[{id:'a',name:'面馆',price:26,category:'面食'},{id:'b',name:'火锅',price:80,category:'火锅'},{id:'c',name:'家常菜',price:38,category:'家常菜'}];
function room(){return {solo:false,places,members:[{prefs:{budget:100,excluded:[],categories:[]},approved:true,confirmed:true},{prefs:{budget:40,excluded:[],categories:[]},approved:true,confirmed:false}],rejected:[],stage:'result',result:places[0]};}
test('共同候选满足所有人的预算，不能放宽最低预算',()=>{assert.deepEqual(candidates(room()).map(x=>x.id),['a','c']);});
test('排除品类、店铺与本轮异议均为硬排除',()=>{const r=room();r.members[0].prefs.categories=['面食'];r.members[1].prefs.excluded=['c'];assert.deepEqual(candidates(r),[]);r.members[1].prefs.excluded=[];r.rejected=['c'];assert.deepEqual(candidates(r),[]);});
test('未提交和单个参与者都不能代表多人就绪',()=>{const r=room();r.members[1].prefs=null;assert.equal(ready(r),false);assert.deepEqual(candidates(r),[]);r.members.pop();assert.equal(ready(r),false);r.solo=true;assert.equal(ready(r),true);});
test('成员或条件变动后需重新认可，不能沿用确认',()=>{const r=room();assert.equal(approved(r),true);reset(r);assert.equal(approved(r),false);assert.equal(r.result,null);assert.ok(r.members.every(m=>!m.approved&&!m.confirmed));});
test('没有共同候选时，即使全员认可也不能转盘',()=>{const r=room();r.members[1].prefs.budget=0;assert.equal(approved(r),false);});
test('无效预算或重复店铺不能进入房间快照',()=>{assert.throws(()=>validatePlaces([{...places[0],price:-10}]));assert.throws(()=>validatePlaces([places[0],places[0]]));assert.throws(()=>validatePlaces([]));});
test('每次重置都更换候选轮次，避免旧候选被认可',()=>{const r=room();reset(r);const first=r.round;reset(r);assert.equal(r.round,first+1);});
