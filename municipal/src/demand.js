import {routeAccess} from './routing.js';
import {roadDaily} from './lanes.js';
const PER_HOUR={am:{home:.22,work:.05,shop:.12,school:.025,leisure:.06},pm:{home:.065,work:.7,shop:.4,school:.16,leisure:.24},midday:{home:.09,work:.12,shop:.32,school:.06,leisure:.25}};
const DESIRE={am:{home:1,work:8,shop:1.4,school:10,leisure:.5},pm:{home:8,work:1,shop:3.5,school:.3,leisure:2},midday:{home:2,work:3,shop:7,school:1,leisure:5}};
export function gatewayRate(edge,period='pm'){
 const daily=edge.daily||roadDaily(edge),share=period==='am'?.085:period==='midday'?.05:.095,directional=edge.forward&&edge.backward?.52:.95,rate=daily*share*directional/3600;
 return Math.max(.003,Math.min((edge.baseLanes||edge.lanes||1)*.65,rate));
}
// Prefix weights avoid rescanning every building for each requested departure.
export function weightedPool(items,weight=()=>1){let total=0;const cumulative=[],ranges=new Map();for(const item of items){const w=weight(item);ranges.set(item.id,{start:total,weight:w});total+=w;cumulative.push(total);}return{items,cumulative,ranges,total};}
export function pickPool(pool,random,excluded){const omit=excluded===undefined?null:pool.ranges.get(excluded),total=pool.total-(omit?.weight||0);if(!pool.items.length||total<=0)return null;let choice=random()*total;if(omit&&choice>=omit.start)choice+=omit.weight;let lo=0,hi=pool.items.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(pool.cumulative[mid]<=choice)lo=mid+1;else hi=mid;}return pool.items[lo];}
export class TripDemand{
 constructor(world,random,period='pm',cache=new Map()){
  this.world=world;this.random=random;this.period=period;this.cache=cache;this.serial=0;this.gateways=[];
  for(const n of world.outlets||[])for(const edge of n.edges){const reverse=edge.b===n.id,inbound=reverse?edge.backward:edge.forward,outbound=reverse?edge.forward:edge.backward,bearing=['N','NE','E','SE','S','SW','W','NW'][(Math.round(Math.atan2(n.x,-n.z)*4/Math.PI)+8)%8];this.gateways.push({component:n.component,id:`gateway/${n.id}/${edge.id}`,name:`${edge.name} · ${bearing} ${/motorway|trunk/.test(edge.tags?.highway||'')?(edge.tags.highway.includes('_link')?'highway ramp':'highway gateway'):edge.major?'arterial gateway':'local boundary'}`,kind:'gateway',node:n.id,edgeId:edge.id,position:reverse?edge.length:0,point:{x:n.x,z:n.z},roadClass:edge.tags?.highway||'unclassified',major:edge.major,inbound,outbound,rate:gatewayRate(edge,period),basis:edge.observation?'dated daily count + modeled peak share':'road-class estimate'});}
  this.locations=world.origins.filter(o=>o.edgeId!==undefined);this.localPools=new Map(['home','work','shop','school','leisure'].map(kind=>[kind,weightedPool(this.locations.filter(o=>o.kind===kind),o=>o.weight)]));this.destinationPools=new Map();this.dispatchCursor=0;const localRate=PER_HOUR[period]||PER_HOUR.pm;
  this.streams=[...this.gateways.filter(g=>g.inbound).map(g=>({id:g.id,kind:'gateway',origin:g,rate:g.rate})),...['home','work','shop','school','leisure'].map(kind=>({id:`local/${kind}`,kind,rate:this.locations.filter(o=>o.kind===kind).reduce((s,o)=>s+o.weight,0)*(localRate[kind]||.1)/3600}))].filter(s=>s.rate>0);
  for(const stream of this.streams){stream.remaining=this.headway(stream.rate);stream.requested=0;stream.deferred=0;stream.createdSum=0;}
  this.totalRate=this.streams.reduce((s,g)=>s+g.rate,0);
 }
 headway(rate){return Math.max(.25,-Math.log(Math.max(.00001,1-this.random()))/rate);}
 pick(items,weight=()=>1){if(!items.length)return null;const total=items.reduce((s,i)=>s+weight(i),0);let choice=this.random()*total;return items.find(i=>(choice-=weight(i))<=0)||items.at(-1);}
 destination(origin,external){
  if(external){const gateways=this.gateways.filter(g=>g.component===origin.component&&g.outbound&&g.node!==origin.node&&Math.hypot(g.point.x-origin.point.x,g.point.z-origin.point.z)>160);return this.pick(gateways,g=>g.rate*Math.max(.1,Math.hypot(g.point.x-origin.point.x,g.point.z-origin.point.z)/300)*(g.major?3:1));}
  let weights=DESIRE[this.period]||DESIRE.pm;if(origin.kind==='home')weights=this.period==='am'?{home:.02,work:10,shop:1,school:12,leisure:.4}:{home:.1,work:.5,shop:7,school:.2,leisure:6};const key=origin.component+'/'+(origin.kind==='home'?'home':'other');let pool=this.destinationPools.get(key);if(!pool){pool=weightedPool(this.locations.filter(o=>o.component===origin.component),o=>o.weight*(weights[o.kind]||1));this.destinationPools.set(key,pool);}return pickPool(pool,this.random,origin.id);
 }
 trip(stream,time){
  for(let attempt=0;attempt<10;attempt++){
   const from=stream.origin||pickPool(this.localPools.get(stream.kind),this.random);if(!from)return null;
   const highway=/motorway|trunk/.test(from.roadClass||''),external=from.kind==='gateway'?this.random()<(highway?.72:from.major?.48:.08):this.random()<(this.period==='am'?.32:.24);
   const to=this.destination(from,external)||this.destination(from,!external);if(!to)continue;const path=routeAccess(this.world,from,to,this.cache);if(!path)continue;
   const serial=this.serial++,length=path.reduce((s,p)=>s+(p.endAt??p.edge.length)-(p.startAt??0),0),purpose=from.kind==='gateway'?(to.kind==='gateway'?'Through district':'Arriving in district'):to.kind==='gateway'?'Leaving district':`${from.kind} → ${to.kind}`;
   stream.requested++;return{id:serial,tripId:serial,path,created:time,color:Math.floor(this.random()*8),driver:.9+this.random()*.18,vehicleLength:serial%13===0?5.3:4.5,trip:{from,to,purpose,length,source:stream.id,demandBasis:from.kind==='gateway'?from.basis:'mapped land use + modeled departure activity'}};
  }
  return null;
 }
 get deferred(){return this.streams.reduce((n,s)=>n+s.deferred,0);}
 advance(dt,time,multiplier=1,capacity=Infinity){
  const trips=[];let slots=Math.max(0,capacity);
  // Under overload, keep upstream demand as scalar reservoirs instead of routing
  // thousands of cars that cannot enter. Destinations are assigned on dispatch.
  let empty=0;while(this.deferred&&slots>0&&empty<this.streams.length){const stream=this.streams[this.dispatchCursor++%this.streams.length];if(!stream.deferred){empty++;continue;}const mean=stream.createdSum/stream.deferred,trip=this.trip(stream,mean);if(!trip){empty++;continue;}stream.deferred--;stream.createdSum=stream.deferred?stream.createdSum-mean:0;trips.push(trip);slots--;empty=0;}
  if(multiplier<=0)return trips;
  for(const stream of this.streams){stream.remaining-=dt*multiplier;while(stream.remaining<=0){
   if(slots>0){const trip=this.trip(stream,time);if(trip){trips.push(trip);slots--;}}
   else{stream.deferred++;stream.createdSum+=time;}
   stream.remaining+=this.headway(stream.rate);
  }}return trips;
 }
 summary(){return this.streams.map(s=>({name:s.origin?.name||`${s.kind} departures`,kind:s.kind,rate:s.rate*3600,requested:s.requested+s.deferred,deferred:s.deferred,basis:s.origin?.basis||'modeled activity'})).sort((a,b)=>b.rate-a.rate);}
}
