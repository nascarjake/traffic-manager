import {eligibleLanes} from './lanes.js';
import {movementForPaths} from './movements.js';
import {pointOnEdge} from './data.js';
export const STOP_DISTANCE=21;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function connector(incoming,outgoing,inLane=0,outLane=0,startDistance=STOP_DISTANCE){
 const entry=Math.min(startDistance,incoming.edge.length*.45),exit=Math.min(21,outgoing.edge.length*.45),a=pointOnEdge(incoming.edge,incoming.edge.length-entry,incoming.reverse,inLane),b=pointOnEdge(outgoing.edge,exit,outgoing.reverse,outLane),chord=Math.hypot(b.x-a.x,b.z-a.z),handle=Math.min(27,Math.max(5,chord*.53)),p=[a,{x:a.x+Math.sin(a.angle)*handle,z:a.z+Math.cos(a.angle)*handle},{x:b.x-Math.sin(b.angle)*handle,z:b.z-Math.cos(b.angle)*handle},b],samples=[0];let previous=a;
 for(let i=1;i<=32;i++){const q=bezier(p,i/32);samples.push(samples.at(-1)+Math.hypot(q.x-previous.x,q.z-previous.z));previous=q;}
 return{points:p,samples,length:samples.at(-1),entry,exit,inLane,outLane};
}
function bezier(p,t){const s=1-t;return{x:s*s*s*p[0].x+3*s*s*t*p[1].x+3*s*t*t*p[2].x+t*t*t*p[3].x,z:s*s*s*p[0].z+3*s*s*t*p[1].z+3*s*t*t*p[2].z+t*t*t*p[3].z};}
export function connectorPose(curve,distance){distance=clamp(distance,0,curve.length);let i=1;while(i<32&&curve.samples[i]<distance)i++;const f=(distance-curve.samples[i-1])/(curve.samples[i]-curve.samples[i-1]||1),t=(i-1+f)/32,p=bezier(curve.points,t),s=1-t,dx=3*s*s*(curve.points[1].x-curve.points[0].x)+6*s*t*(curve.points[2].x-curve.points[1].x)+3*t*t*(curve.points[3].x-curve.points[2].x),dz=3*s*s*(curve.points[1].z-curve.points[0].z)+6*s*t*(curve.points[2].z-curve.points[1].z)+3*t*t*(curve.points[3].z-curve.points[2].z);return{...p,y:(curve.points[0].y||0)+((curve.points[3].y||0)-(curve.points[0].y||0))*t,angle:Math.atan2(dx,dz)};}
export function carPose(car){if(car.turn)return connectorPose(car.turn.curve,car.turn.distance);const p=car.path[car.index],change=car.laneChange,progress=change?clamp(change.elapsed/change.duration,0,1):0,lane=change?change.from+(change.to-change.from)*(progress*progress*(3-2*progress)):car.lane;return pointOnEdge(p.edge,car.position,p.reverse,lane);}
export function advanceCar(car,meters){
 if(car.turn){const turn=car.turn;turn.distance+=meters;const curve=turn.curve,virtual=(curve.entry+curve.exit)*Math.min(1,turn.distance/curve.length);if(virtual<curve.entry){car.index=turn.index;car.position=car.path[car.index].edge.length-curve.entry+virtual;}else{car.index=turn.index+1;car.position=virtual-curve.entry;car.lane=curve.outLane;car.committed=null;car.stopTime=0;}if(turn.distance>=curve.length){car.position=curve.exit+turn.distance-curve.length;car.turn=null;}return false;}
 car.position+=meters;const p=car.path[car.index],end=p.endAt??p.edge.length;if(car.position<end)return false;if(car.index===car.path.length-1)return true;car.position-=p.edge.length;car.index++;car.stopTime=0;car.committed=null;return false;
}
export function connectorsConflict(a,b){const ap=a.conflictSamples||(a.conflictSamples=Array.from({length:17},(_,i)=>connectorPose(a,a.length*i/16))),bp=b.conflictSamples||(b.conflictSamples=Array.from({length:17},(_,i)=>connectorPose(b,b.length*i/16)));for(const p of ap)for(const q of bp)if(Math.hypot(p.x-q.x,p.z-q.z)<3.5)return true;return false;}

export function remainingDistance(car){let total=0,index=car.index,start=car.position;if(car.turn){total=Math.max(0,car.turn.curve.length-car.turn.distance);index=car.turn.index+1;start=car.turn.curve.exit;}for(let i=index;i<car.path.length;i++){const p=car.path[i],q=car.path[i+1],end=p.endAt??p.edge.length;if(!q){total+=Math.max(0,end-start);break;}const move=movementForPaths(p,q),lane=i===car.index?car.lane:(eligibleLanes(p,move)[0]??0),out=move==='left'?0:move==='right'?q.edge.lanes-1:Math.min(lane,q.edge.lanes-1),curve=connector(p,q,lane,out);total+=Math.max(0,p.edge.length-curve.entry-start)+curve.length;start=curve.exit;}return total;}
