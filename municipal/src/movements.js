import {roadWidth,sampleRoad} from './city-layout.js';
const movementCache=new WeakMap();
export function movementForPaths(incoming,outgoing){
 if(!outgoing||!incoming.edge.points||!outgoing.edge.points)return 'through';
 // Look beyond the short kinks introduced when mapped junction nodes merge.
 const e=incoming.edge,q=outgoing.edge;let cache=movementCache.get(e);if(!cache){cache=new WeakMap();movementCache.set(e,cache);}let pair=cache.get(q);if(!pair||pair.ep!==e.points||pair.qp!==q.points||pair.el!==e.length||pair.ql!==q.length){pair={ep:e.points,qp:q.points,el:e.length,ql:q.length,values:[]};cache.set(q,pair);}const key=Number(!!incoming.reverse)*2+Number(!!outgoing.reverse);if(pair.values[key])return pair.values[key];const end=incoming.reverse?e.points[0]:e.points.at(-1),a=Math.min(35,e.length*.45),b=Math.min(35,q.length*.45),before=sampleRoad(e,incoming.reverse?a:e.length-a),after=sampleRoad(q,outgoing.reverse?q.length-b:b);
 const ax=end.x-before.x,az=end.z-before.z,bx=after.x-end.x,bz=after.z-end.z,angle=Math.atan2(ax*bz-az*bx,ax*bx+az*bz);
 return pair.values[key]=angle<-.4?'left':angle>.4?'right':'through';
}
export function hasLeftMovement(n,group,permitted=()=>true){return !!n.edges?.some(e=>e.points?.length>=2&&group.edges.includes(e.id)&&permitted({edge:e,reverse:e.a===n.id})&&(e.a===n.id?e.backward:e.forward)&&n.edges.some(q=>q!==e&&q.points?.length>=2&&(q.a===n.id?q.forward:q.backward)&&movementForPaths({edge:e,reverse:e.a===n.id},{edge:q,reverse:q.b===n.id})==='left'));}
export function crosswalksFor(n){return (n.edges||[]).filter(e=>e.length>=40&&e.points?.length>=2).map(e=>{const p=sampleRoad(e,e.a===n.id?14:e.length-14),sign=e.a===n.id?1:-1,dx=p.dx*sign,dz=p.dz*sign,half=roadWidth(e)/2+1.25;return{y:n.y||0,node:n.id,edge:e.id,length:half*2,a:{x:n.x+dx*14-dz*half,z:n.z+dz*14+dx*half},b:{x:n.x+dx*14+dz*half,z:n.z+dz*14-dx*half},dx,dz};});}
export function pedestrianClearance(n){return Math.max(10,Math.ceil(Math.max(0,...crosswalksFor(n).map(w=>w.length))/1.1)+2);}
export function pedestrianPosition(p,crosswalk){const start=p.side?crosswalk.b:crosswalk.a,end=p.side?crosswalk.a:crosswalk.b,t=p.walking?Math.min(1,p.distance/crosswalk.length):0,queue=p.offset;return{y:crosswalk.y||0,x:start.x+(end.x-start.x)*t+crosswalk.dx*queue,z:start.z+(end.z-start.z)*t+crosswalk.dz*queue,angle:Math.atan2(end.x-start.x,end.z-start.z)};}
