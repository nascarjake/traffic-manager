import {movementForPaths,hasLeftMovement,crosswalksFor,pedestrianClearance} from './movements.js';
import {approachRule} from './controls.js';
import {route} from './data.js';
export function rng(seed=418){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function defaultPlan(n){return {control:n.control,mode:'fixed',greens:n.groups.map((g,i)=>i===0?18:30),protectedLefts:n.groups.map(g=>hasLeftMovement(n,g)),leftGreen:8,pedestrian:!!n.edges?.length,pedWalk:7,minGreen:8,gap:3,yellow:3,allRed:2,offset:0};}
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
  this.world=world;this.random=rng(opts.seed??418);this.time=0;this.cars=[];this.pendingTrips=[];this.id=0;this.completed=0;this.generated=0;this.totalDelay=0;this.spawnClock=0;this.demand=opts.demand??1;this.period=opts.period||'pm';this.routeCache=new Map();this.controllers=new Map(world.junctions.map(n=>[n.id,new Controller(n,plans.get(n.id)||defaultPlan(n))]));this.history=[];this.pedRandom=rng((opts.seed??418)^0x51ba23);this.pedestrians=[];this.pedGenerated=0;this.pedCompleted=0;this.pedWait=0;this.pedClock=0;this.pedId=0;this.pedestrianDemand=opts.pedestrianDemand??opts.demand??1;this.refreshGeometry();if(this.pedestrianDemand>0)for(const n of world.junctions.filter(n=>n.control==='signal'))for(let i=0;i<2;i++)this.requestPedestrian(n);
  const observations=[...new Map(world.edges.filter(e=>e.observation).map(e=>[e.observation.segmentid,e.observation])).values()];
  const mean=observations.length?observations.reduce((s,o)=>s+(+o.vehiclecount),0)/observations.length:11000;
  // A modelled 8% peak-hour share, distributed over the playable boundary and local generators.
  this.baseRate=Math.max(.55,Math.min(8,mean*.08/3600*5*Math.sqrt(Math.max(1,world.edges.length/131))));
 }
 choose(items,weight=()=>1){let sum=items.reduce((s,i)=>s+weight(i),0),t=this.random()*sum;for(const i of items){t-=weight(i);if(t<=0)return i;}return items.at(-1);}
 requestTrip(){
  const w=this.world;if(!w.outlets.length)return;
  const endpoint=()=>this.choose(w.outlets,n=>Math.max(...n.edges.map(e=>e.daily),1000)).id;
  const local=kind=>this.choose(w.origins,b=>b.weight*(b.kind===kind?5:1)).node;
  let start,end;
  if(this.random()<.4||!w.origins.length){start=endpoint();end=endpoint();}
  else {const work=this.period==='am'?'home':'work',home=this.period==='am'?'work':'home';start=this.random()<.35?endpoint():local(work);end=this.random()<.35?endpoint():local(home);}
  const key=`${start}-${end}`;let path=this.routeCache.get(key);if(path===undefined){path=route(w,start,end);this.routeCache.set(key,path);}
  if(!path||path.reduce((s,p)=>s+p.edge.length,0)<100)return;
  this.generated++;this.pendingTrips.push({path,created:this.time,color:Math.floor(this.random()*8)});
 }
 laneFor(car,index=car.index){let p=car.path[index],next=car.path[index+1];if(p.edge.lanes<2)return 0;
  if(!p.edge.turnBay)return car.id%p.edge.lanes;
  if(!next)return 0;
  return movementForPaths(p,next)==='left'?0:1;
 }
 step(dt){
  this.time+=dt;const priorPedestrianCrossings=new Set(this.pedestrians.filter(p=>p.walking).map(p=>p.node));for(const car of this.cars)if(car.crossing&&car.index>car.crossing.index&&car.position>=20)car.crossing=null;this.pedClock+=dt*this.pedestrianDemand*.85*Math.sqrt(Math.max(1,this.world.junctions.length/64));while(this.pedClock>=1){this.pedClock--;this.requestPedestrian();}this.spawnClock+=dt*this.baseRate*this.demand*(this.period==='midday'?.62:1);
  while(this.spawnClock>=1){this.spawnClock--;this.requestTrip();}
  const lanes=new Map(),key=(p,l)=>`${p.edge.id}:${p.reverse?1:0}:${l}`;
  for(const c of this.cars){let p=c.path[c.index],k=key(p,c.lane);if(!lanes.has(k))lanes.set(k,[]);lanes.get(k).push(c);}
  for(const lane of lanes.values())lane.sort((a,b)=>b.position-a.position);
  // Deferred trips retain their departure time: blocked demand cannot disappear from the score.
  const waiting=[];for(const t of this.pendingTrips){const p=t.path[0],car={...t,id:this.id,index:0,position:0,speed:0,wait:0,delay:0,stopTime:0};car.lane=this.laneFor(car);const queue=lanes.get(key(p,car.lane))||[];
   const source=p.reverse?p.edge.b:p.edge.a,sourceCtl=this.controllers.get(source),sourceBlocked=sourceCtl&&(!sourceCtl.allows(p.edge.id,'through')||priorPedestrianCrossings.has(source));if(sourceBlocked||queue.length&&queue.at(-1).position<(sourceCtl?32:10)){waiting.push(t);this.totalDelay+=dt;continue;}
   if(sourceCtl)car.crossing={node:source,index:-1};this.id++;car.delay=this.time-t.created;this.cars.push(car);queue.push(car);lanes.set(key(p,car.lane),queue);
  }this.pendingTrips=waiting;
  const nearby=new Map(),occupied=new Set(),pedestrianContext=new Map();for(const car of this.cars){if(car.crossing)occupied.add(car.crossing.node);const p=car.path[car.index],end=p.reverse?p.edge.a:p.edge.b;if(p.edge.length-car.position<65){if(!nearby.has(end))nearby.set(end,[]);nearby.get(end).push(car);}}for(const p of this.pedestrians){if(!pedestrianContext.has(p.node))pedestrianContext.set(p.node,{waiting:false,crossing:false});pedestrianContext.get(p.node)[p.walking?'crossing':'waiting']=true;}
  const leftDetect=new Map([...this.controllers].map(([id,c])=>[id,c.node.groups.map(()=>false)]));
  const detect=new Map([...this.controllers].map(([id,c])=>[id,c.node.groups.map(()=>false)]));
  for(const c of this.cars){const p=c.path[c.index],end=p.reverse?p.edge.a:p.edge.b,ctl=this.controllers.get(end);if(ctl&&p.edge.length-c.position<40){let g=ctl.node.groups.findIndex(g=>g.edges.includes(p.edge.id));if(g>=0){const left=movementForPaths(p,c.path[c.index+1])==='left';if(left)leftDetect.get(end)[g]=true;if(!left||!ctl.plan.protectedLefts[g])detect.get(end)[g]=true;}}}
  for(const [id,c] of this.controllers)c.step(dt,detect.get(id),{leftDetected:leftDetect.get(id),pedestrianCall:pedestrianContext.get(id)?.waiting,vehiclesClearing:occupied.has(id),pedestriansCrossing:pedestrianContext.get(id)?.crossing});
  this.stepPedestrians(dt,{nearby,occupied});const activePedestrianNodes=new Set(this.pedestrians.filter(p=>p.walking).map(p=>p.node));
  const done=new Set();
  for(const queue of lanes.values())for(let j=0;j<queue.length;j++){
   const c=queue[j],p=c.path[c.index],e=p.edge,end=p.reverse?e.a:e.b,ctl=this.controllers.get(end),remaining=e.length-c.position,next=c.path[c.index+1];
   let limit=e.major?12:8,gap=j?queue[j-1].position-c.position-5:1e6;
   let blocked=false;
   if(ctl&&remaining<45){
    const movement=movementForPaths(p,next);let allowed=ctl.allows(e.id,movement);
    if(activePedestrianNodes.has(end))allowed=false;
    if(movement==='left'&&ctl.plan.control==='signal'&&!ctl.plan.protectedLefts[ctl.node.groups.findIndex(g=>g.edges.includes(e.id))]){const before=p.reverse?e.points[1]:e.points.at(-2),finish=p.reverse?e.points[0]:e.points.at(-1),dx=finish.x-before.x,dz=finish.z-before.z;allowed=allowed&&!(nearby.get(end)||[]).some(other=>{if(other===c)return false;const q=other.path[other.index],node=q.reverse?q.edge.a:q.edge.b;if(node!==end||q.edge.id===e.id||movementForPaths(q,other.path[other.index+1])==='left')return false;const a=q.reverse?q.edge.points[1]:q.edge.points.at(-2),b=q.reverse?q.edge.points[0]:q.edge.points.at(-1),dot=(dx*(b.x-a.x)+dz*(b.z-a.z))/(Math.hypot(dx,dz)*Math.hypot(b.x-a.x,b.z-a.z));return dot<-.6&&q.edge.length-other.position<Math.max(20,other.speed*4);});}
    const rule=approachRule(ctl,e.id);if(rule==='stop')allowed=allowed&&c.stopTime>=1.5&&this.time>=ctl.releaseAt;
    if((rule==='stop'||rule==='yield')&&ctl.plan.control==='priority')allowed=allowed&&!(nearby.get(end)||[]).some(other=>{if(other===c)return false;const p=other.path[other.index];return (p.reverse?p.edge.a:p.edge.b)===end&&approachRule(ctl,p.edge.id)==='priority'&&p.edge.length-other.position<Math.max(24,other.speed*3.5);});
    if(ctl.owner!==null&&ctl.owner!==c.id&&this.time<ctl.releaseAt)allowed=false;
    const nextLane=next?this.laneFor(c,c.index+1):0,nextQueue=next?lanes.get(key(next,nextLane)):null;
    if(nextQueue?.length&&nextQueue.at(-1).position<32)allowed=false;
    if(c.committed===end)allowed=true;
    if(allowed&&remaining<=16&&c.committed!==end){c.committed=end;c.crossing={node:end,index:c.index};ctl.owner=c.id;ctl.releaseAt=this.time+(ctl.plan.control==='stop'?2.8:1.6);}
    blocked=!allowed;
   }
   if(blocked)gap=Math.min(gap,Math.max(0,remaining-13));
   const target=Math.min(limit,Math.max(0,(gap-2)/1.35));
   c.speed=Math.max(0,Math.min(target,c.speed+2.2*dt));
   const advance=Math.min(c.speed*dt,Math.max(0,gap-1));c.position+=advance;
   if(c.speed<.5){c.wait+=dt;if(remaining<17)c.stopTime+=dt;}else c.stopTime=0;
   const delay=dt*(1-c.speed/limit);c.delay+=delay;this.totalDelay+=delay;

   if(c.position>=e.length){if(next){c.position-=e.length;c.index++;c.lane=this.laneFor(c);c.stopTime=0;c.committed=null;}else {done.add(c.id);this.completed++;}}
  }
  this.cars=this.cars.filter(c=>!done.has(c.id));
  if(Math.floor(this.time)%5===0&&this.history.at(-1)?.t!==Math.floor(this.time)){this.history.push({t:Math.floor(this.time),delay:this.metrics().delay});if(this.history.length>120)this.history.shift();}
 }
 refreshGeometry(){this.crosswalks=new Map(this.world.junctions.map(n=>[n.id,crosswalksFor(n)]));for(const c of this.controllers.values())c.refreshGeometry();}
 requestPedestrian(node){const options=node?[node]:this.world.junctions.filter(n=>this.crosswalks.get(n.id)?.length);if(!options.length)return null;const total=options.reduce((s,n)=>s+(n.control==='signal'?5:1),0);let pick=this.pedRandom()*total;node=options.find(n=>(pick-=n.control==='signal'?5:1)<=0)||options.at(-1);const walks=this.crosswalks.get(node.id);if(!walks?.length)return null;const w=walks[Math.floor(this.pedRandom()*walks.length)],p={id:this.pedId++,node:node.id,edge:w.edge,side:this.pedRandom()<.5?0:1,speed:1.1+this.pedRandom()*.15,distance:0,walking:false,wait:0,offset:(this.pedRandom()-.5)*2.8,color:Math.floor(this.pedRandom()*6)};this.pedestrians.push(p);this.pedGenerated++;const ctl=this.controllers.get(node.id);if(ctl?.plan.control==='signal')ctl.pedestrianCall=true;return p;}
 stepPedestrians(dt,{nearby,occupied}){const finished=new Set();for(const p of this.pedestrians){const ctl=this.controllers.get(p.node),walk=this.crosswalks.get(p.node)?.find(w=>w.edge===p.edge);if(!walk){finished.add(p.id);continue;}if(!p.walking){const state=ctl.pedestrianSignal(),safe=!occupied.has(p.node);const gap=state==='uncontrolled'&&!(nearby.get(p.node)||[]).some(car=>{const q=car.path[car.index];return(q.reverse?q.edge.a:q.edge.b)===p.node&&q.edge.length-car.position<Math.max(25,car.speed*4);});if(safe&&(state==='walk'||gap))p.walking=true;else{p.wait+=dt;this.pedWait+=dt;}}if(p.walking){p.distance+=p.speed*dt;if(p.distance>=walk.length){finished.add(p.id);this.pedCompleted++;}}}this.pedestrians=this.pedestrians.filter(p=>!finished.has(p.id));}
 metrics(){const stopped=this.cars.filter(c=>c.speed<1).length,avgSpeed=this.cars.length?this.cars.reduce((s,c)=>s+c.speed,0)/this.cars.length*3.6:0;return {delay:this.generated?this.totalDelay/this.generated:0,queue:stopped+this.pendingTrips.length,speed:avgSpeed,completed:this.completed,active:this.cars.length,generated:this.generated,pedGenerated:this.pedGenerated,pedCompleted:this.pedCompleted,pedWaiting:this.pedestrians.filter(p=>!p.walking).length,pedDelay:this.pedGenerated?this.pedWait/this.pedGenerated:0};}
 queueAt(id){return this.cars.filter(c=>{let p=c.path[c.index];return (p.reverse?p.edge.a:p.edge.b)===id&&p.edge.length-c.position<65&&c.speed<2;}).length;}
 warmup(seconds=40){for(let t=0;t<seconds;t+=.2)this.step(.2);}
}
export function evaluate(world,plans,opts={}){
 const a=new Simulation(world,new Map(),opts),b=new Simulation(world,plans,opts);
 // The baseline retains the imported lane counts; candidate receives the edited lane geometry.
 const originals=world.edges.map(e=>({e,lanes:e.lanes,turnBay:e.turnBay}));
 for(const x of originals){x.e.lanes=x.e.baseLanes;x.e.turnBay=false;}
 for(let t=0;t<240;t+=.2)a.step(.2);
 for(const x of originals){x.e.lanes=x.lanes;x.e.turnBay=x.turnBay;}
 for(let t=0;t<240;t+=.2)b.step(.2);
 return {baseline:a.metrics(),candidate:b.metrics(),seconds:240};
}
