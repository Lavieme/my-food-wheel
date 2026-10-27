// All slices use the same angular size. Labels sit on a shared concentric ring.
export function wheelLayout(places) {
  const n=places.length;
  if(!n||n>60) throw new RangeError('The wheel supports 1–60 options');
  const step=360/n;
  const colors=['#F6C7AE','#DCE8C9','#F4E1A6','#D3E6E0','#E9DDED','#F0D8CA'];
  const point=(r,angle)=>({x:200+r*Math.sin(angle*Math.PI/180),y:200-r*Math.cos(angle*Math.PI/180)});
  return places.map((p,i)=>{
    const start=point(182,i*step),end=point(182,(i+1)*step);
    const radius=n===1?112:n===2?110:n<=4?112:n<=10?125:153;
    const center=point(radius,(i+.5)*step);
    const max=n<=2?7:n<=4?6:n<=6?5:n<=8?4:3;
    const chars=Array.from(p.name);
    const label=chars.length>max?chars.slice(0,max-1).join('')+'…':p.name;
    return {id:p.id,index:i,number:String(i+1).padStart(2,'0'),name:p.name,label:n<=10?label:'',x:center.x,y:center.y,angle:(i+.5)*step,color:colors[i%colors.length],path:n===1?null:`M 200 200 L ${start.x} ${start.y} A 182 182 0 ${step>180?1:0} 1 ${end.x} ${end.y} Z`};
  });
}
export function rotationForIndex(count,index) {
  if(!Number.isInteger(count)||count<1||count>60||!Number.isInteger(index)||index<0||index>=count) throw new RangeError('Invalid wheel index');
  return 360-(index+.5)*360/count;
}
