import {outgoingPaths,legalConnection} from './lanes.js';
import {movementForPaths} from './movements.js';
export const TRAFFIC_COLORS={moving:0xf4ffe6,turning:0x57e7ff,waiting:0xffb14e};
export const MOVEMENT_SYMBOLS={left:'↰',through:'↑',right:'↱'};
export function vehicleCue(car){
 const path=car.path[car.index],remaining=path.edge.length-car.position,movement=car.turn?.movement||movementForPaths(path,car.path[car.index+1]);
 const turning=movement!=='through'&&(!!car.turn||remaining<70);
 return{state:car.speed<.7?'waiting':turning?'turning':'moving',movement:turning?movement:'through',turning};
}
export function approachReadings(sim,node){
 return node.edges.filter(e=>e.a===node.id?e.backward:e.forward).map(edge=>{
  const cars=sim.cars.filter(c=>{const p=c.path[c.index];return !c.turn&&(p.endAt===undefined||p.endAt>=p.edge.length-1)&&p.edge===edge&&(p.reverse?p.edge.a:p.edge.b)===node.id&&edge.length-c.position<140;});
  const waiting=cars.filter(c=>c.speed<.7).length;
  const point=edge.a===node.id?edge.points[1]:edge.points.at(-2),bearing=['N','NE','E','SE','S','SW','W','NW'][(Math.round(Math.atan2(point.x-node.x,node.z-point.z)*4/Math.PI)+8)%8];
  return{edge,bearing,waiting,approaching:cars.length,movements:['left','through','right'].map(movement=>{
   const p={edge,reverse:edge.a===node.id},possible=outgoingPaths(node).some(q=>legalConnection(p,q)&&movementForPaths(p,q)===movement);const states=(possible?Array.from({length:edge.lanes},(_,lane)=>sim.rightOfWay(node.id,edge.id,movement,lane)):[]).filter(s=>s.reason!=='Movement prohibited in this lane');
   return{movement,state:states.find(s=>s.state==='go')?.state||states.find(s=>s.state==='yield')?.state||states.find(s=>s.state==='clearance')?.state||'stop',available:states.length>0,reason:states[0]?.reason||'No mapped lane or exit for this movement'};
  })};
 });
}
