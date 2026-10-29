import {TripDemand} from './demand.js';
import {roadSpeed,eligibleLanes} from './lanes.js';
import {connector,advanceCar,connectorsConflict,STOP_DISTANCE} from './motion.js';
import {pointOnEdge} from './data.js';
import {movementForPaths,hasLeftMovement,crosswalksFor,pedestrianClearance} from './movements.js';
import {approachRule} from './controls.js';
import {route} from './data.js';
export function rng(seed=418){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function defaultPlan(n){return {control:n.control,mode:'fixed',greens:n.groups.map((g,i)=>i===0?18:30),protectedLefts:n.groups.map(g=>hasLeftMovement(n,g,p=>eligibleLanes(p,'left',true).length>0)),leftGreen:8,pedestrian:!!n.edges?.length,pedWalk:7,minGreen:8,gap:3,yellow:3,allRed:2,offset:0};}
export function normalizePlan(p,n){return {...defaultPlan(n),...structuredClone(p)};}
export function validatePlan(value,n){
 const p=normalizePlan(value,n);
 if(!['signal','stop','priority'].includes(p.control)||!['fixed','actuated'].includes(p.mode))return false;
 return Array.isArray(p.greens)&&p.greens.length===n.groups.length&&p.greens.every(x=>Number.isFinite(x)&&x>=8&&x<=90)&&Array.isArray(p.protectedLefts)&&p.protectedLefts.length===n.groups.length&&p.protectedLefts.every(x=>typeof x==='boolean')&&Number.isFinite(p.leftGreen)&&p.leftGreen>=5&&p.leftGreen<=30&&typeof p.pedestrian==='boolean'&&Number.isFinite(p.pedWalk)&&p.pedWalk>=7&&p.pedWalk<=20&&p.minGreen>=5&&p.minGreen<=Math.min(...p.greens)&&p.gap>=1&&p.gap<=6&&p.yellow>=3&&p.allRed>=2&&p.offset>=0&&p.offset<=120;
}
export function planProgram(value,n){
 const p=normalizePlan(value,n),program=[];
 for(let phase=0;phase<n.groups.length;phase++){
  for(const kind of(p.protectedLefts[phase]?['left','through']:['through'])){
   program.push({phase,kind,stage:'green',duration:kind==='left'?p.leftGreen:p.greens[phase]},{phase,kind,stage:'yellow',duration:p.yellow},{phase,kind,stage:'all-red',duration:p.allRed});
  }
 }
 if(p.pedestrian&&crosswalksFor(n).length)program.push({phase:-1,kind:'pedestrian',stage:'walk',duration:p.pedWalk},{phase:-1,kind:'pedestrian',stage:'ped-clear',duration:pedestrianClearance(n)},{phase:-1,kind:'pedestrian',stage:'all-red',duration:p.allRed});
 return program;
}
export class Controller{
 constructor(n,plan){
  this.node=n;this.plan=normalizePlan(plan,n);this.clock=0;this.program=planProgram(this.plan,n);this.programIndex=0;this.phase=0;this.kind='through';this.stage='green';this.elapsed=0;this.gapElapsed=0;this.maxElapsed=0;this.lastReason='Fixed cycle';this.pending=null;this.releaseAt=0;this.owner=null;this.pedestrianCall=false;
  if(this.plan.control==='signal')Object.assign(this,this.fixedState());
 }
 fixedState(){let t=((this.clock-this.plan.offset)%this.cycleLength()+this.cycleLength())%this.cycleLength();for(const [programIndex,item]of this.program.entries()){if(t<item.duration)return{programIndex,phase:item.phase,kind:item.kind,stage:item.stage,elapsed:t};t-=item.duration;}return{programIndex:0,...this.program[0],elapsed:0};}
 cycleLength(){return this.program.reduce((s,item)=>s+item.duration,0)||1;}
 refreshGeometry(){const prior=this.program[this.programIndex];this.program=planProgram(this.plan,this.node);this.programIndex=Math.max(0,this.program.findIndex(p=>p.phase===prior?.phase&&p.kind===prior?.kind&&p.stage===prior?.stage));}
 apply(plan){this.pending=normalizePlan(plan,this.node);if(this.plan.control!=='signal'){this.stage='all-red';this.elapsed=0;}}
 advance(context){
  if(this.stage==='all-red'&&this.pending){this.plan=this.pending;this.pending=null;this.program=planProgram(this.plan,this.node);this.programIndex=-1;if(this.plan.mode==='fixed'&&this.plan.control==='signal'){Object.assign(this,this.fixedState());this.gapElapsed=this.maxElapsed=0;return;}}
  let index=(this.programIndex+1)%this.program.length;
  if(this.plan.mode==='actuated')for(let attempts=0;attempts<this.program.length;attempts++){
   const item=this.program[index];
   if(item.kind==='left'&&item.stage==='green'&&!context.leftDetected?.[item.phase]){index=(index+3)%this.program.length;continue;}
   if(item.kind==='pedestrian'&&item.stage==='walk'&&!this.pedestrianCall){index=(index+3)%this.program.length;continue;}
   break;
  }
  this.programIndex=index;const item=this.program[index];this.phase=item.phase;this.kind=item.kind;this.stage=item.stage;this.elapsed=this.gapElapsed=this.maxElapsed=0;
  if(this.stage==='walk')this.pedestrianCall=false;
 }
 step(dt,detected,context={}){
  this.detected=detected;this.clock+=dt;this.pedestrianCall=this.pedestrianCall||!!context.pedestrianCall;
  if(this.plan.control!=='signal'&&!this.pending){this.pedestrianCall=false;return;}
  this.elapsed+=dt;
  if(this.stage==='walk')this.pedestrianCall=false;
  if(this.stage==='all-red'){
   if(context.vehiclesClearing)this.lastReason='Vehicle clearing junction';else if(context.pedestriansCrossing)this.lastReason='Pedestrian clearing crossing';if(this.elapsed>=this.plan.allRed&&!context.vehiclesClearing&&!context.pedestriansCrossing)this.advance(context);
   return;
  }
  const current=this.program[this.programIndex];
  if(this.stage==='green'&&this.kind==='through'){
   this.gapElapsed=detected[this.phase]?0:this.gapElapsed+dt;
   const opposing=detected.some((v,i)=>v&&i!==this.phase)||!!context.leftDetected?.some(Boolean)||this.pedestrianCall;
   if(opposing)this.maxElapsed+=dt;else this.maxElapsed=0;
   const timed=this.plan.mode==='fixed'&&this.elapsed>=current.duration,maxout=this.plan.mode==='actuated'&&opposing&&this.maxElapsed>=current.duration,gapout=this.plan.mode==='actuated'&&opposing&&this.elapsed>=this.plan.minGreen&&this.gapElapsed>=this.plan.gap,change=this.pending&&this.plan.mode==='actuated'&&this.elapsed>=this.plan.minGreen;
   if(timed||maxout||gapout||change){this.lastReason=change?'Plan change':gapout?'Gap-out':maxout?'Max-out':'Fixed cycle';this.advance(context);}
  }else if(this.elapsed>=current.duration&&!(this.stage==='ped-clear'&&context.pedestriansCrossing))this.advance(context);
 }
 movementSignal(edgeId,movement='through'){
  if(this.plan.control!=='signal')return 'off';
  if(!this.node.groups[this.phase]?.edges.includes(edgeId)||this.kind==='pedestrian'||this.stage==='all-red')return 'red';
  const protectedLeft=this.plan.protectedLefts[this.phase];
  if(movement==='left'?(protectedLeft?this.kind!=='left':this.kind!=='through'):this.kind!=='through')return 'red';
  return this.stage==='green'?'green':this.stage==='yellow'?'yellow':'red';
 }
 pedestrianSignal(){if(this.plan.control!=='signal')return 'uncontrolled';return this.kind==='pedestrian'&&this.stage==='walk'?'walk':this.kind==='pedestrian'&&this.stage==='ped-clear'?'clearance':'dont-walk';}
 allows(edgeId,movement='through'){if(this.pending&&this.stage==='all-red')return false;if(this.plan.control!=='signal')return true;return this.movementSignal(edgeId,movement)==='green';}
}
export class Simulation{
 constructor(world,plans=new Map(),opts={}){
  this.world=world;this.random=rng(opts.seed??418);this.time=0;this.cars=[];this.pendingTrips=[];this.id=0;this.completed=0;this.generated=0;this.totalDelay=0;this.demand=opts.demand??1;this.period=opts.period||'pm';this.routeCache=new Map();this.controllers=new Map(world.junctions.map(n=>[n.id,new Controller(n,plans.get(n.id)||defaultPlan(n))]));this.history=[];
  this.tripDemand=new TripDemand(world,this.random,this.period,this.routeCache);this.baseRate=this.tripDemand.totalRate;this.pedRandom=rng((opts.seed??418)^0x51ba23);this.pedestrians=[];this.pedGenerated=0;this.pedCompleted=0;this.pedWait=0;this.pedClock=0;this.pedId=0;this.pedestrianDemand=opts.pedestrianDemand??opts.demand??1;this.refreshGeometry();
  if(this.pedestrianDemand>0)for(const n of world.junctions.filter(n=>n.control==='signal'))for(let i=0;i<2;i++)this.requestPedestrian(n);
 }
 laneFor(car,index=car.index){const p=car.path[index],movement=movementForPaths(p,car.path[index+1]),lanes=eligibleLanes(p,movement);if(!lanes.length)return 0;if(movement==='left')return lanes[0];if(movement==='right')return lanes.at(-1);return lanes[(car.tripId??car.id??0)%lanes.length];}
 exitLane(car){const next=car.path[car.index+1],move=movementForPaths(car.path[car.index],next);return move==='left'?0:move==='right'?next.edge.lanes-1:Math.min(car.lane,next.edge.lanes-1);}
 rightOfWay(node,edgeId,movement,lane=0){const ctl=this.controllers.get(node),edge=this.world.edges.find(e=>e.id===edgeId);if(!ctl||!edge)return{state:'go',reason:'Uncontrolled connection'};const p={edge,reverse:edge.a===node};if(!eligibleLanes(p,movement).includes(lane))return{state:'stop',reason:'Movement prohibited in this lane'};if(this.activePedestrianNodes?.has(node))return{state:'stop',reason:'Pedestrians crossing'};if(ctl.pending&&ctl.stage==='all-red')return{state:'stop',reason:'Controller clearance'};
  if(ctl.plan.control==='signal'){const light=ctl.movementSignal(edgeId,movement);if(light!=='green')return{state:light==='yellow'?'clearance':'stop',reason:light==='yellow'?'Yellow / clear junction':'Red signal'};const phase=ctl.node.groups.findIndex(g=>g.edges.includes(edgeId));return movement==='left'&&!ctl.plan.protectedLefts[phase]?{state:'yield',reason:'Permissive left / yield to opposing traffic'}:{state:'go',reason:movement==='left'?'Protected arrow':'Green signal'};}
  const rule=approachRule(ctl,edgeId);return{state:rule==='priority'?'go':'yield',reason:rule==='stop'?'Stop, then yield':rule==='yield'?'Yield to priority approaches':'Priority road'};
 }
 step(dt){
  this.time+=dt;const requested=this.tripDemand.advance(dt,this.time,this.demand);this.generated+=requested.length;this.pendingTrips.push(...requested);
  const priorPedestrians=new Set(this.pedestrians.filter(p=>p.walking).map(p=>p.node));for(const car of this.cars)if(car.crossing&&!car.turn&&car.index>car.crossing.index&&car.position>=20)car.crossing=null;
  this.pedClock+=dt*this.pedestrianDemand*.85*Math.sqrt(Math.max(1,this.world.junctions.length/64));while(this.pedClock>=1){this.pedClock--;this.requestPedestrian();}
  const lanes=new Map(),key=(p,l)=>`${p.edge.id}:${Number(p.reverse)}:${l}`;
  const put=(car,lane)=>{const k=key(car.path[car.index],lane);if(!lanes.has(k))lanes.set(k,[]);lanes.get(k).push(car);};
  for(const c of this.cars){c._stepPosition=c.position;c._stepSpeed=c.speed;put(c,c.lane);if(c.laneChange)put(c,c.laneChange.to);}
  const waiting=[];
  for(const t of this.pendingTrips){const p=t.path[0],car={...t,id:t.id??this.id,index:0,position:p.startAt??0,speed:0,wait:0,delay:0,stopTime:0};car.lane=this.laneFor(car);const queue=lanes.get(key(p,car.lane))||[],source=p.reverse?p.edge.b:p.edge.a,sourceCtl=car.position<22?this.controllers.get(source):null,blocked=sourceCtl&&(!sourceCtl.allows(p.edge.id,'through')||priorPedestrians.has(source));
   const unsafe=queue.some(c=>{const delta=c.position-car.position;return delta>=0?delta<(sourceCtl?32:12):(-delta<Math.max(14,c.speed*2.2));});
   if(blocked||unsafe){waiting.push(t);this.totalDelay+=dt;continue;}
   if(sourceCtl)car.crossing={node:source,index:-1};if(car.trip?.from.kind==='gateway'&&!queue.some(c=>c.position-car.position<55&&c.position>=car.position))car.speed=Math.min(roadSpeed(p.edge)*.65,15);car._stepPosition=car.position;car._stepSpeed=car.speed;car.delay=this.time-t.created;this.id++;this.cars.push(car);put(car,car.lane);
  }
  this.pendingTrips=waiting;
  // Reserve both lanes during a merge; vehicles behind see the same physical obstacle.
  for(const c of this.cars){if(c.turn)continue;const p=c.path[c.index],ideal=this.laneFor(c);if(!c.laneChange&&ideal!==c.lane&&c.position>23){const target=c.lane+Math.sign(ideal-c.lane),neighbors=lanes.get(key(p,target))||[],safe=neighbors.every(other=>other===c||Math.abs(other._stepPosition-c.position)>Math.max(10,other._stepPosition<c.position?other.speed*1.6:c.speed*1.2));if(safe){c.laneChange={from:c.lane,to:target,elapsed:0,duration:2.1};put(c,target);}}
   if(c.laneChange){c.laneChange.elapsed+=dt;if(c.laneChange.elapsed>=c.laneChange.duration){c.lane=c.laneChange.to;c.laneChange=null;}}
  }
  for(const q of lanes.values())q.sort((a,b)=>b._stepPosition-a._stepPosition);
  const nearby=new Map(),occupied=new Set(),pedestrianContext=new Map(),activeTurns=new Map();
  for(const c of this.cars){if(c.crossing)occupied.add(c.crossing.node);if(c.turn){if(!activeTurns.has(c.turn.node))activeTurns.set(c.turn.node,[]);activeTurns.get(c.turn.node).push(c);}const p=c.path[c.index],end=p.reverse?p.edge.a:p.edge.b;if(p.edge.length-c.position<65){if(!nearby.has(end))nearby.set(end,[]);nearby.get(end).push(c);}}
  for(const p of this.pedestrians){if(!pedestrianContext.has(p.node))pedestrianContext.set(p.node,{waiting:false,crossing:false});pedestrianContext.get(p.node)[p.walking?'crossing':'waiting']=true;}
  const detect=new Map([...this.controllers].map(([id,c])=>[id,c.node.groups.map(()=>false)])),leftDetect=new Map([...this.controllers].map(([id,c])=>[id,c.node.groups.map(()=>false)]));
  for(const c of this.cars){if(c.turn)continue;const p=c.path[c.index],end=p.reverse?p.edge.a:p.edge.b,ctl=this.controllers.get(end);if(ctl&&p.edge.length-c.position<45){const g=ctl.node.groups.findIndex(g=>g.edges.includes(p.edge.id)),left=movementForPaths(p,c.path[c.index+1])==='left';if(g>=0){if(left)leftDetect.get(end)[g]=true;if(!left||!ctl.plan.protectedLefts[g])detect.get(end)[g]=true;}}}
  for(const[id,c]of this.controllers)c.step(dt,detect.get(id),{leftDetected:leftDetect.get(id),pedestrianCall:pedestrianContext.get(id)?.waiting,vehiclesClearing:occupied.has(id),pedestriansCrossing:pedestrianContext.get(id)?.crossing});
  this.stepPedestrians(dt,{nearby,occupied});this.activePedestrianNodes=new Set(this.pedestrians.filter(p=>p.walking).map(p=>p.node));
  const done=new Set(),processed=new Set();
  for(const [laneKey,queue]of lanes)for(let j=0;j<queue.length;j++){
   const c=queue[j];if(processed.has(c.id)||laneKey!==key(c.path[c.index],c.lane))continue;processed.add(c.id);const p=c.path[c.index],e=p.edge,end=p.reverse?e.a:e.b,next=c.path[c.index+1],ctl=this.controllers.get(end),remaining=e.length-c.position,move=c.turn?.movement||movementForPaths(p,next),leader=j?queue[j-1]:null;
   let limit=roadSpeed(e)*(c.driver||1),gap=leader?leader._stepPosition-c._stepPosition-((leader.vehicleLength||4.5)+(c.vehicleLength||4.5))/2:1e6,leaderSpeed=leader?leader._stepSpeed:limit,blocked=false;
   if(c.turn||next&&remaining<45&&move!=='through')limit=Math.min(limit,move==='right'?5.5:7);
   if(p.endAt!==undefined&&c.index===c.path.length-1&&p.endAt<e.length-1)limit=Math.min(limit,Math.max(2.5,Math.sqrt(Math.max(0,p.endAt-c.position)*3)));
   if(!c.turn&&remaining<55&&(next||p.endAt===undefined||p.endAt>=e.length-1)){
    let allowed=ctl?ctl.allows(e.id,move):true;if(this.activePedestrianNodes.has(end)||c.laneChange||!eligibleLanes(p,move).includes(c.lane))allowed=false;
    if(ctl){const rule=approachRule(ctl,e.id);if(rule==='stop')allowed=allowed&&c.stopTime>=1.5;
     if((rule==='stop'||rule==='yield')&&ctl.plan.control==='priority')allowed=allowed&&!(nearby.get(end)||[]).some(other=>other!==c&&approachRule(ctl,other.path[other.index].edge.id)==='priority'&&other.path[other.index].edge.length-other.position<Math.max(24,other.speed*3.5));
     if(move==='left'&&ctl.plan.control==='signal'&&!ctl.plan.protectedLefts[ctl.node.groups.findIndex(g=>g.edges.includes(e.id))])allowed=allowed&&!(nearby.get(end)||[]).some(other=>{const q=other.path[other.index];if(other===c||q.edge===e||movementForPaths(q,other.path[other.index+1])==='left')return false;const a=pointOnEdge(e,e.length,p.reverse,c.lane),b=pointOnEdge(q.edge,q.edge.length,q.reverse,other.lane);return Math.cos(a.angle-b.angle)<-.6&&q.edge.length-other.position<Math.max(20,other.speed*4);});
    }
    const outLane=next?this.exitLane(c):0,nextQueue=next?lanes.get(key(next,outLane)):null,connection=next?`${e.id}:${Number(p.reverse)}:${c.lane}>${next.edge.id}:${Number(next.reverse)}:${outLane}`:'';if(nextQueue?.some(other=>other!==c&&other._stepPosition<32&&other.turn?.connection!==connection))allowed=false;
    if(next&&next.edge.length<47){const n=next.reverse?next.edge.a:next.edge.b,target=this.controllers.get(n);if(target&&!target.allows(next.edge.id,movementForPaths(next,c.path[c.index+2])))allowed=false;}
    if(allowed&&remaining<=STOP_DISTANCE+.3){
     if(next){const curve=connector(p,next,c.lane,outLane,remaining),connection=`${e.id}:${Number(p.reverse)}:${c.lane}>${next.edge.id}:${Number(next.reverse)}:${outLane}`,conflict=(activeTurns.get(end)||[]).some(other=>other!==c&&other.turn&&(other.turn.connection===connection?other.turn.distance<Math.max(9,c.speed*1.2+4):connectorsConflict(curve,other.turn.curve)));
      if(conflict)allowed=false;else{c.turn={node:end,index:c.index,distance:0,curve,connection,movement:move};c.crossing={node:end,index:c.index};c.committed=end;if(!activeTurns.has(end))activeTurns.set(end,[]);activeTurns.get(end).push(c);}
     }else if(ctl){c.crossing={node:end,index:c.index};c.committed=end;}
    }
    if(c.committed===end)allowed=true;blocked=!allowed;
   }
   if(blocked){gap=Math.min(gap,Math.max(0,remaining-(STOP_DISTANCE-2)));leaderSpeed=0;}
   const v=c.speed,a=2.2,b=3,s0=2,desiredGap=s0+Math.max(0,v*1.25+v*(v-leaderSpeed)/(2*Math.sqrt(a*b))),acceleration=Math.max(-6,Math.min(a,a*(1-Math.pow(v/Math.max(2,limit),4)-Math.pow(desiredGap/Math.max(.2,gap),2))));
   c.speed=Math.max(0,c.speed+acceleration*dt);let advance=Math.min(c.speed*dt,Math.max(0,gap-1));if(advance<c.speed*dt)c.speed=advance/dt;c.braking=acceleration<-.7||c.speed<.5;c.indicator=(c.turn||remaining<55)&&move!=='through'?move:null;
   c.distanceTravelled=(c.distanceTravelled||0)+advance;if(c.speed<.5){c.wait+=dt;if(remaining<STOP_DISTANCE+2)c.stopTime+=dt;}else c.stopTime=0;
   const delay=dt*(1-Math.min(1,c.speed/Math.max(2,roadSpeed(e)*(c.driver||1))));c.delay+=delay;this.totalDelay+=delay;
   if(advanceCar(c,advance)){done.add(c.id);this.completed++;}
  }
  this.cars=this.cars.filter(c=>!done.has(c.id));if(Math.floor(this.time)%5===0&&this.history.at(-1)?.t!==Math.floor(this.time)){this.history.push({t:Math.floor(this.time),delay:this.metrics().delay});if(this.history.length>120)this.history.shift();}
 }
 refreshGeometry(){this.crosswalks=new Map(this.world.junctions.map(n=>[n.id,crosswalksFor(n)]));for(const c of this.controllers.values())c.refreshGeometry();}
 requestPedestrian(node){const options=node?[node]:this.world.junctions.filter(n=>this.crosswalks.get(n.id)?.length);if(!options.length)return null;const total=options.reduce((s,n)=>s+(n.control==='signal'?5:1),0);let pick=this.pedRandom()*total;node=options.find(n=>(pick-=n.control==='signal'?5:1)<=0)||options.at(-1);const walks=this.crosswalks.get(node.id);if(!walks?.length)return null;const w=walks[Math.floor(this.pedRandom()*walks.length)],p={id:this.pedId++,node:node.id,edge:w.edge,side:this.pedRandom()<.5?0:1,speed:1.1+this.pedRandom()*.15,distance:0,walking:false,wait:0,offset:(this.pedRandom()-.5)*2.8,color:Math.floor(this.pedRandom()*6)};this.pedestrians.push(p);this.pedGenerated++;const ctl=this.controllers.get(node.id);if(ctl?.plan.control==='signal')ctl.pedestrianCall=true;return p;}
 stepPedestrians(dt,{nearby,occupied}){const finished=new Set();for(const p of this.pedestrians){const ctl=this.controllers.get(p.node),walk=this.crosswalks.get(p.node)?.find(w=>w.edge===p.edge);if(!walk){finished.add(p.id);continue;}if(!p.walking){const state=ctl.pedestrianSignal(),safe=!occupied.has(p.node),gap=state==='uncontrolled'&&!(nearby.get(p.node)||[]).some(car=>{const q=car.path[car.index];return(q.reverse?q.edge.a:q.edge.b)===p.node&&q.edge.length-car.position<Math.max(25,car.speed*4);});if(safe&&(state==='walk'||gap))p.walking=true;else{p.wait+=dt;this.pedWait+=dt;}}if(p.walking){p.distance+=p.speed*dt;if(p.distance>=walk.length){finished.add(p.id);this.pedCompleted++;}}}this.pedestrians=this.pedestrians.filter(p=>!finished.has(p.id));}
 metrics(){const stopped=this.cars.filter(c=>c.speed<1).length;return{delay:this.generated?this.totalDelay/this.generated:0,queue:stopped+this.pendingTrips.length,speed:this.cars.length?this.cars.reduce((s,c)=>s+c.speed,0)/this.cars.length*3.6:0,completed:this.completed,active:this.cars.length,generated:this.generated,pedGenerated:this.pedGenerated,pedCompleted:this.pedCompleted,pedWaiting:this.pedestrians.filter(p=>!p.walking).length,pedDelay:this.pedGenerated?this.pedWait/this.pedGenerated:0,turning:this.cars.filter(c=>c.turn&&c.turn.movement!=='through').length,crossing:this.cars.filter(c=>c.turn).length,changingLanes:this.cars.filter(c=>c.laneChange).length,arrivalRate:this.baseRate*this.demand*3600};}
 queueAt(id){return this.cars.filter(c=>{const p=c.path[c.index];return(p.reverse?p.edge.a:p.edge.b)===id&&p.edge.length-c.position<65&&c.speed<2;}).length;}
 warmup(seconds=60){for(let t=0;t<seconds;t+=.2)this.step(.2);}
}
export function evaluate(world,plans,opts={}){
 const originals=world.edges.map(e=>({e,lanes:e.lanes,turnBay:e.turnBay}));let baseline;
 try{for(const x of originals){x.e.lanes=x.e.baseLanes;x.e.turnBay=false;}const a=new Simulation(world,new Map(),opts);for(let t=0;t<240;t+=.2)a.step(.2);baseline=a.metrics();}finally{for(const x of originals){x.e.lanes=x.lanes;x.e.turnBay=x.turnBay;}}
 const b=new Simulation(world,plans,opts);for(let t=0;t<240;t+=.2)b.step(.2);return{baseline,candidate:b.metrics(),seconds:240};
}
