import {Simulation} from './simulation.js';
import {incomingPaths,outgoingPaths,legalConnection} from './lanes.js';
import {movementForPaths} from './movements.js';
import {pointOnEdge} from './data.js';
// A repeatable synthetic wave. Requests use the normal safe-entry and conflict rules.
export function drillConnections(node,mix='mixed'){
 const result=[];
 for(const p of incomingPaths(node))for(const q of outgoingPaths(node)){
  const movement=movementForPaths(p,q);
  if(p.edge.length<58||q.edge.length<48||!legalConnection(p,q)||mix!=='mixed'&&mix!==movement)continue;
  result.push({p,q,movement});
 }
 return result.sort((a,b)=>String(a.p.edge.id).localeCompare(String(b.p.edge.id))||String(a.q.edge.id).localeCompare(String(b.q.edge.id)));
}
export function createJunctionDrill(world,plans,node,{count=30,mix='mixed'}={}){
 const connections=drillConnections(node,mix);if(!connections.length)throw Error('No suitable mapped lanes for that movement. Try mixed traffic or another junction.');
 count=[10,30,60,120].includes(count)?count:30;const sim=new Simulation(world,plans,{demand:0,pedestrianDemand:0,seed:914});
 for(let id=0;id<count;id++){
  const {p,q,movement}=connections[id%connections.length],start=Math.max(24,p.edge.length-145),end=Math.min(110,q.edge.length-23),fromPoint=pointOnEdge(p.edge,start,p.reverse),toPoint=pointOnEdge(q.edge,end,q.reverse),from={id:`drill-in/${p.edge.id}`,kind:'test approach',name:p.edge.name,point:fromPoint},to={id:`drill-out/${q.edge.id}`,kind:'test exit',name:q.edge.name,point:toPoint};
  sim.pendingTrips.push({id,tripId:id,path:[{...p,startAt:start},{...q,endAt:end}],created:0,color:id%8,driver:1,vehicleLength:4.5,drillMovement:movement,trip:{from,to,purpose:`Junction drill · ${movement}`,source:'synthetic-junction-wave',demandBasis:'Repeatable synthetic test wave',length:p.edge.length-start+end}});
 }
 sim.generated=count;sim.drill={node:node.id,count,mix,duration:180};return sim;
}
export function drillResult(sim){const m=sim.metrics(),cleared=m.completed,total=sim.drill.count,finished=cleared===total||sim.time>=sim.drill.duration;
 return{finished,cleared,total,remaining:Math.max(0,sim.drill.duration-sim.time),delay:m.delay,waiting:sim.cars.filter(c=>c.speed<.7).length+sim.pendingTrips.length,medal:!finished?null:cleared===total&&sim.time<=120?'gold':cleared>=total*.8?'silver':'retry'};
}
