import {approachRule} from './controls.js';
import {route} from './data.js';
export function rng(seed=418){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function defaultPlan(n){return {control:n.control,mode:'fixed',greens:n.groups.map((g,i)=>i===0?18:30),minGreen:8,gap:3,yellow:3,allRed:2,offset:0};}
export function validatePlan(p,n){if(!['signal','stop','priority'].includes(p.control)||!['fixed','actuated'].includes(p.mode))return false;return p.greens.length===n.groups.length&&p.greens.every(x=>Number.isFinite(x)&&x>=8&&x<=90)&&p.minGreen>=5&&p.minGreen<=Math.min(...p.greens)&&p.gap>=1&&p.gap<=6&&p.yellow>=3&&p.allRed>=2&&p.offset>=0&&p.offset<=120;}
export class Controller{
 constructor(n,plan){this.node=n;this.plan=structuredClone(plan);this.clock=0;this.phase=0;this.stage='green';this.elapsed=0;this.gapElapsed=0;this.maxElapsed=0;this.lastReason='Fixed cycle';this.pending=null;this.releaseAt=0;this.owner=null;if(plan.mode==='fixed'&&plan.control==='signal')Object.assign(this,this.fixedState());}
 fixedState(){let total=this.plan.greens.reduce((a,b)=>a+b,0)+this.plan.greens.length*(this.plan.yellow+this.plan.allRed),t=((this.clock-this.plan.offset)%total+total)%total;for(let phase=0;phase<this.plan.greens.length;phase++){const g=this.plan.greens[phase];if(t<g)return {phase,stage:'green',elapsed:t};t-=g;if(t<this.plan.yellow)return {phase,stage:'yellow',elapsed:t};t-=this.plan.yellow;if(t<this.plan.allRed)return {phase,stage:'all-red',elapsed:t};t-=this.plan.allRed;}return {phase:0,stage:'green',elapsed:0};}
 apply(plan){this.pending=structuredClone(plan);if(this.plan.control!=='signal'){this.stage='all-red';this.elapsed=0;}}
 step(dt,detected){
  this.detected=detected;this.clock+=dt;if(this.plan.control!=='signal'&&!this.pending)return;
  this.elapsed+=dt;
  if(this.stage==='green'){
   this.gapElapsed=detected[this.phase]?0:this.gapElapsed+dt;
   const opposing=detected.some((v,i)=>v&&i!==this.phase);
   if(opposing)this.maxElapsed+=dt;else this.maxElapsed=0;
   const max=this.plan.greens[this.phase]||30;
   const timed=this.plan.mode==='fixed'&&this.elapsed>=max;
   const maxout=this.plan.mode==='actuated'&&opposing&&this.maxElapsed>=max;
   const gapout=this.plan.mode==='actuated'&&opposing&&this.elapsed>=this.plan.minGreen&&this.gapElapsed>=this.plan.gap;
   const planChange=this.pending&&this.plan.mode==='actuated'&&this.elapsed>=this.plan.minGreen;
   if(timed||maxout||gapout||planChange){this.stage='yellow';this.elapsed=0;this.lastReason=planChange?'Plan change':gapout?'Gap-out':maxout?'Max-out':'Fixed cycle';}
  }else if(this.stage==='yellow'&&this.elapsed>=this.plan.yellow){this.stage='all-red';this.elapsed=0;}
  else if(this.stage==='all-red'&&this.elapsed>=this.plan.allRed){if(this.pending){this.plan=this.pending;this.pending=null;this.phase=-1;if(this.plan.mode==='fixed'&&this.plan.control==='signal'){const scheduled=this.fixedState();Object.assign(this,scheduled);return;}}this.phase=(this.phase+1)%Math.max(1,this.node.groups.length);this.stage='green';this.elapsed=0;this.gapElapsed=0;this.maxElapsed=0;}
 }
 allows(edgeId){if(this.pending&&this.stage==='all-red')return false;if(this.plan.control!=='signal')return true;return this.stage==='green'&&this.node.groups[this.phase]?.edges.includes(edgeId);}
}
export class Simulation{
 constructor(world,plans=new Map(),opts={}){
  this.world=world;this.random=rng(opts.seed??418);this.time=0;this.cars=[];this.pendingTrips=[];this.id=0;this.completed=0;this.generated=0;this.totalDelay=0;this.spawnClock=0;this.demand=opts.demand??1;this.period=opts.period||'pm';this.routeCache=new Map();this.controllers=new Map(world.junctions.map(n=>[n.id,new Controller(n,plans.get(n.id)||defaultPlan(n))]));this.history=[];
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
  const a=p.reverse?p.edge.points[0]:p.edge.points.at(-1),before=p.reverse?p.edge.points[1]:p.edge.points.at(-2),after=next.reverse?next.edge.points.at(-2):next.edge.points[1];
  const cross=(a.x-before.x)*(after.z-a.z)-(a.z-before.z)*(after.x-a.x);
  return cross<0?0:1;
 }
 step(dt){
  this.time+=dt;this.spawnClock+=dt*this.baseRate*this.demand*(this.period==='midday'?.62:1);
  while(this.spawnClock>=1){this.spawnClock--;this.requestTrip();}
  const lanes=new Map(),key=(p,l)=>`${p.edge.id}:${p.reverse?1:0}:${l}`;
  for(const c of this.cars){let p=c.path[c.index],k=key(p,c.lane);if(!lanes.has(k))lanes.set(k,[]);lanes.get(k).push(c);}
  for(const lane of lanes.values())lane.sort((a,b)=>b.position-a.position);
  // Deferred trips retain their departure time: blocked demand cannot disappear from the score.
  const waiting=[];for(const t of this.pendingTrips){const p=t.path[0],car={...t,id:this.id,index:0,position:0,speed:0,wait:0,delay:0,stopTime:0};car.lane=this.laneFor(car);const queue=lanes.get(key(p,car.lane))||[];
   if(queue.length&&queue.at(-1).position<10){waiting.push(t);this.totalDelay+=dt;continue;}
   this.id++;car.delay=this.time-t.created;this.cars.push(car);queue.push(car);lanes.set(key(p,car.lane),queue);
  }this.pendingTrips=waiting;
  const detect=new Map([...this.controllers].map(([id,c])=>[id,c.node.groups.map(()=>false)]));
  for(const c of this.cars){const p=c.path[c.index],end=p.reverse?p.edge.a:p.edge.b,ctl=this.controllers.get(end);if(ctl&&p.edge.length-c.position<40){let g=ctl.node.groups.findIndex(g=>g.edges.includes(p.edge.id));if(g>=0)detect.get(end)[g]=true;}}
  for(const [id,c] of this.controllers)c.step(dt,detect.get(id));
  const done=new Set();
  for(const queue of lanes.values())for(let j=0;j<queue.length;j++){
   const c=queue[j],p=c.path[c.index],e=p.edge,end=p.reverse?e.a:e.b,ctl=this.controllers.get(end),remaining=e.length-c.position,next=c.path[c.index+1];
   let limit=e.major?12:8,gap=j?queue[j-1].position-c.position-5:1e6;
   let blocked=false;
   if(ctl&&remaining<45&&next){
    let allowed=ctl.allows(e.id);
    const rule=approachRule(ctl,e.id);if(rule==='stop')allowed=allowed&&c.stopTime>=1.5&&this.time>=ctl.releaseAt;
    if((rule==='stop'||rule==='yield')&&ctl.plan.control==='priority')allowed=allowed&&!this.cars.some(other=>{if(other===c)return false;const p=other.path[other.index];return (p.reverse?p.edge.a:p.edge.b)===end&&approachRule(ctl,p.edge.id)==='priority'&&p.edge.length-other.position<Math.max(24,other.speed*3.5);});
    if(ctl.owner!==null&&ctl.owner!==c.id&&this.time<ctl.releaseAt)allowed=false;
    const nextLane=this.laneFor(c,c.index+1),nextQueue=lanes.get(key(next,nextLane));
    if(nextQueue?.length&&nextQueue.at(-1).position<12)allowed=false;
    if(c.committed===end)allowed=true;
    if(allowed&&remaining<=16&&c.committed!==end){c.committed=end;ctl.owner=c.id;ctl.releaseAt=this.time+(ctl.plan.control==='stop'?2.8:1.6);}
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
 metrics(){const stopped=this.cars.filter(c=>c.speed<1).length,avgSpeed=this.cars.length?this.cars.reduce((s,c)=>s+c.speed,0)/this.cars.length*3.6:0;return {delay:this.generated?this.totalDelay/this.generated:0,queue:stopped+this.pendingTrips.length,speed:avgSpeed,completed:this.completed,active:this.cars.length,generated:this.generated};}
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
