import {incomingPaths,outgoingPaths,laneMovements,legalConnection} from './lanes.js';
import {movementForPaths} from './movements.js';
import {approachReadings} from './traffic-state.js';
export const FOCUS_COLORS={go:0x5bffa0,yield:0xffd04f,clearance:0xffd04f,stop:0xff756d,waiting:0xffb74d,turning:0x57e7ff};
export function junctionFocusState(sim,node){
 const readings=approachReadings(sim,node),outgoing=outgoingPaths(node),turns=sim.cars.filter(c=>c.turn?.node===node.id&&c.turn.movement!=='through');
 const approaches=incomingPaths(node).map(path=>{
  const edge=path.edge,cars=sim.cars.filter(car=>{const p=car.path[car.index];return !car.turn&&p.edge===edge&&p.reverse===path.reverse&&edge.length-car.position<140&&(p.endAt===undefined||p.endAt>=edge.length-1);});
  const turning=turns.filter(car=>car.path[car.turn.index].edge===edge&&car.path[car.turn.index].reverse===path.reverse);
  const lanes=Array.from({length:edge.lanes},(_,lane)=>{
   const occupants=cars.filter(c=>c.lane===lane||c.laneChange?.to===lane),waiting=occupants.filter(c=>c.speed<.7),head=[...occupants].sort((a,b)=>b.position-a.position)[0];
   const moves=laneMovements(edge,path.reverse,lane).filter(move=>outgoing.some(q=>legalConnection(path,q)&&movementForPaths(path,q)===move)),movement=head?movementForPaths(path,head.path[head.index+1]):moves.includes('through')?'through':moves[0]||'through';
   return{lane,movement,moves,permission:sim.rightOfWay(node.id,edge.id,movement,lane),waiting,tail:waiting.length?Math.min(...waiting.map(c=>c.position)):null,front:waiting.length?Math.max(...waiting.map(c=>c.position)):null};
  });
  return{path,edge,lanes,movements:readings.find(r=>r.edge===edge)?.movements||[],waiting:cars.filter(c=>c.speed<.7).length,turningLeft:turning.filter(c=>c.turn.movement==='left').length,turningRight:turning.filter(c=>c.turn.movement==='right').length};
 });
 return{approaches,turns,waiting:approaches.reduce((sum,a)=>sum+a.waiting,0),turning:turns.length};
}

export function vehicleInJunctionFocus(car,node){if(!node)return true;if(car.turn?.node===node.id)return true;const p=car.path[car.index],source=p.reverse?p.edge.b:p.edge.a,end=p.reverse?p.edge.a:p.edge.b;return end===node.id&&p.edge.length-car.position<140||source===node.id&&car.position<100;}
