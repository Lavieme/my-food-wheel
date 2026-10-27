import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelLayout,rotationForIndex} from '../lib/wheel-layout.mjs';
for(const n of [1,2,3,5,8,10,11,20,60]){
 test(`${n} 个候选等角分布，编号唯一，指针准确落在选中扇区中心`,()=>{
  const places=Array.from({length:n},(_,i)=>({id:String(i),name:'超长店铺名称·科技园南门店'+i}));
  const layout=wheelLayout(places);
  assert.equal(layout.length,n);
  assert.equal(new Set(layout.map(s=>s.number)).size,n);
  for(let i=0;i<n;i++){
   assert.ok(Math.abs(layout[i].angle-(i+.5)*360/n)<1e-9);
   assert.ok(Math.abs(rotationForIndex(n,i)+layout[i].angle-360)<1e-9);
   assert.ok(Number.isFinite(layout[i].x)&&Number.isFinite(layout[i].y));
   assert.ok(Math.hypot(layout[i].x-200,layout[i].y-200)<182);
   if(n>10)assert.equal(layout[i].label,'');
   else assert.ok(Array.from(layout[i].label).length<=7);
  }
 });
}
test('空候选与无效目标不渲染转盘',()=>{
 assert.throws(()=>wheelLayout([]),RangeError);
 assert.throws(()=>rotationForIndex(3,3),RangeError);
 assert.throws(()=>rotationForIndex(0,0),RangeError);
});
