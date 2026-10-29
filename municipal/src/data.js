import {taggedHeight,roadHeight} from './road-height.js';
import {buildActivityLocations} from './access.js';
import {findRoute} from './routing.js';
import {roadDaily} from './lanes.js';
import {mapControls} from './controls.js';
import {clipSegment} from './district.js';
const DRIVABLE=new Set(['motorway','trunk','primary','secondary','tertiary','residential','unclassified','living_street','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link']);
export const CENTER={lat:41.9097,lon:-87.6774};
export function project(lat,lon,center=CENTER){return {x:(lon-center.lon)*111320*Math.cos(center.lat*Math.PI/180),z:-(lat-center.lat)*111320};}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const normName=s=>(s||'').toUpperCase().replace(/^(NORTH|SOUTH|EAST|WEST|N|S|E|W) /,'').replace(/ (AVENUE|STREET|ROAD|BOULEVARD|AVE|ST|RD|BLVD)$/,'');
export function buildWorld(raw,center=CENTER,counts=[]){
 const osmNodes=new Map(raw.elements.filter(e=>e.type==='node').map(e=>[e.id,{...e,...project(e.lat,e.lon,center)}]));
 const bb=raw.bounds,sw=bb?project(bb[0],bb[1],center):{x:-650,z:570},ne=bb?project(bb[2],bb[3],center):{x:650,z:-570};
 const bounds={minX:sw.x,maxX:ne.x,minZ:ne.z,maxZ:sw.z};let boundaryId=-1;
 const inside=p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
 const buildings=[],greenSpaces=[],places=[],segments=[],adj=new Map();
 const add=(id,s)=>{if(!adj.has(id))adj.set(id,[]);adj.get(id).push(s);};
 for(const e of raw.elements){
  if(e.type==='node'&&(e.tags?.shop||e.tags?.amenity))places.push({...e,...project(e.lat,e.lon,center)});
  if(e.type!=='way')continue;
  const pts=e.nodes.map(i=>osmNodes.get(i)).filter(Boolean);if(pts.length<2)continue;
  if(pts.length>3&&(/^(park|garden|recreation_ground)$/.test(e.tags?.leisure||'')||/^(grass|forest|meadow|recreation_ground|village_green)$/.test(e.tags?.landuse||'')))greenSpaces.push({id:e.id,points:pts,tags:e.tags});
  if(e.tags?.building&&pts.length>3&&pts.some(inside)){const area=Math.abs(pts.reduce((s,p,i)=>{let q=pts[(i+1)%pts.length];return s+p.x*q.z-q.x*p.z},0))/2;if(area>18)buildings.push({id:e.id,points:pts,tags:e.tags,area,center:{x:pts.reduce((s,p)=>s+p.x,0)/pts.length,z:pts.reduce((s,p)=>s+p.z,0)/pts.length}});}
  if(!DRIVABLE.has(e.tags?.highway)||['private','no'].includes(e.tags.access)||e.tags.motor_vehicle==='no')continue;
  for(let i=1;i<pts.length;i++){
   let a=pts[i-1],b=pts[i];if(distance(a,b)<.5)continue;
   const clipped=clipSegment(a,b,bounds);if(!clipped)continue;const [lo,hi]=clipped,originalA=a,originalB=b;
   const boundary=t=>{const p={id:boundaryId--,x:originalA.x+(originalB.x-originalA.x)*t,z:originalA.z+(originalB.z-originalA.z)*t,boundary:true};osmNodes.set(p.id,p);return p;};if(lo>0)a=boundary(lo);if(hi<1)b=boundary(hi);if(distance(a,b)<.5)continue;
   const s={a:a.id,b:b.id,tags:e.tags,way:e.id};segments.push(s);add(a.id,s);add(b.id,s);
  }
 }
 const keep=new Set([...adj].filter(([id,ss])=>ss.length!==2||ss[0].tags.name!==ss[1].tags.name||ss[0].tags.oneway!==ss[1].tags.oneway||ss[0].tags.layer!==ss[1].tags.layer||ss[0].tags.bridge!==ss[1].tags.bridge||ss[0].tags.tunnel!==ss[1].tags.tunnel).map(([id])=>id));
 const graphNodes=new Map([...keep].map(id=>[id,{...osmNodes.get(id),edges:[],groups:[],control:'stop'}]));
 const visited=new Set(),edges=[];
 for(const id of keep)for(const initial of adj.get(id)){
  if(visited.has(initial))continue;
  let curr=id,s=initial,points=[osmNodes.get(id)],controls=[],travel=0,lastTags=initial.tags,lastAligned=initial.a===id,forward=true,backward=true;
  while(s&&!visited.has(s)){
   visited.add(s);lastTags=s.tags;lastAligned=s.a===curr;const next=s.a===curr?s.b:s.a;
   if(s.tags.oneway==='yes'||s.tags.oneway==='1'){if(curr===s.a)backward=false;else forward=false;}
   if(s.tags.oneway==='-1'){if(curr===s.a)forward=false;else backward=false;}
   const p=osmNodes.get(curr),q=osmNodes.get(next);for(const [v,d]of[[p,travel],[q,travel+distance(p,q)]])if(['traffic_signals','stop','give_way'].includes(v.tags?.highway))controls.push({osmId:v.id,type:v.tags.highway,tags:v.tags,distance:d,forwardAlongEdge:s.a===curr});travel+=distance(p,q);
   points.push(q);curr=next;
   if(keep.has(curr))break;
   s=adj.get(curr).find(q=>q!==s);
  }
  if(!graphNodes.has(curr)||curr===id)continue;
  let lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));
  if(lengths.at(-1)<3)continue;
  const e={laneApproaches:{forward:{tags:lastTags,osmForward:lastAligned},backward:{tags:initial.tags,osmForward:initial.a!==id}},osmAligned:initial.a===id,id:edges.length,a:id,b:curr,points,controls,lengths,length:lengths.at(-1),tags:initial.tags,name:initial.tags.name||'Local street',forward,backward,lanes:1,turnBay:false};
  const tagLanes=+initial.tags.lanes||2;e.lanes=Math.min(forward&&backward?3:4,Math.max(1,Math.floor(tagLanes/(forward&&backward?2:1))));
  e.baseLanes=e.lanes;e.major=/motorway|trunk|primary|secondary|tertiary/.test(initial.tags.highway);
  const rows=counts.filter(c=>normName(c.roadname)===normName(e.name)&&+c.vehiclecount>0);
  const mid=points[Math.floor(points.length/2)];rows.sort((a,b)=>distance(project(+a.midpointlat,+a.midpointlon,center),mid)-distance(project(+b.midpointlat,+b.midpointlon,center),mid));
  // Only a nearby, same-road count can calibrate a link. Preserve count date and direction.
  e.observation=rows.find(c=>distance(project(+c.midpointlat,+c.midpointlon,center),mid)<450)||null;
  e.daily=e.observation?+e.observation.vehiclecount:roadDaily(e);
  edges.push(e);graphNodes.get(id).edges.push(e);graphNodes.get(curr).edges.push(e);
 }
 // Retain playable street networks and through highways even when the nearest ramp is outside the district.
 const components=[],seen=new Set();for(const id of graphNodes.keys()){if(seen.has(id))continue;const component=[],todo=[id];seen.add(id);while(todo.length){const n=todo.pop();component.push(n);for(const e of graphNodes.get(n).edges){const k=e.a===n?e.b:e.a;if(!seen.has(k)){seen.add(k);todo.push(k);}}}components.push(component);}
 const largest=components.reduce((a,b)=>a.length>b.length?a:b,[]),valid=new Set();for(const [component,ids]of components.entries()){const usable=ids===largest||ids.some(id=>graphNodes.get(id).edges.length>=3||graphNodes.get(id).edges.some(e=>/motorway|trunk/.test(e.tags.highway)&&e.length>60));if(usable)for(const id of ids){valid.add(id);graphNodes.get(id).component=component;}}
 for(const id of graphNodes.keys())if(!valid.has(id))graphNodes.delete(id);
 let active=edges.filter(e=>valid.has(e.a)&&valid.has(e.b));
 // OSM may model a single large junction as a small triangle of nodes.
 // Contract only short links between branching nodes into one controller area.
 const parent=new Map([...graphNodes.keys()].map(id=>[id,id]));
 const root=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
 for(const e of active)if(e.length<23&&graphNodes.get(e.a).edges.length>=3&&graphNodes.get(e.b).edges.length>=3)parent.set(root(e.b),root(e.a));
 const clusters=new Map();for(const id of graphNodes.keys()){let r=root(id);if(!clusters.has(r))clusters.set(r,[]);clusters.get(r).push(graphNodes.get(id));}
 for(const [id,ns] of clusters){const n=graphNodes.get(id);n.x=ns.reduce((s,n)=>s+n.x,0)/ns.length;n.z=ns.reduce((s,n)=>s+n.z,0)/ns.length;n.members=ns.map(p=>({id:p.id,tags:p.tags}));for(const e of active)if(root(e.a)===id&&root(e.b)===id)for(const c of e.controls||[])if(c.type==='traffic_signals')n.members.push({id:c.osmId,tags:c.tags});n.edges=[];if(ns.some(n=>n.tags?.highway==='traffic_signals'))n.tags={...n.tags,highway:'traffic_signals'};for(const old of ns)if(old.id!==id)graphNodes.delete(old.id);}
 active=active.filter(e=>{e.a=root(e.a);e.b=root(e.b);if(e.a===e.b)return false;e.points=[graphNodes.get(e.a),...e.points.slice(1,-1),graphNodes.get(e.b)];e.lengths=[0];for(let i=1;i<e.points.length;i++)e.lengths.push(e.lengths.at(-1)+distance(e.points[i-1],e.points[i]));e.length=e.lengths.at(-1);graphNodes.get(e.a).edges.push(e);graphNodes.get(e.b).edges.push(e);return true;});
 for(const n of graphNodes.values()){
  n.edges=n.edges.filter(e=>active.includes(e));
  for(const e of n.edges){let p=e.a===n.id?e.points[1]:e.points.at(-2);let angle=(Math.atan2(p.z-n.z,p.x-n.x)+Math.PI*2)%Math.PI;
   let group=n.groups.find(g=>g.name===e.name||(e.name==='Local street'&&Math.min(Math.abs(g.angle-angle),Math.PI-Math.abs(g.angle-angle))<.35));
   if(!group){group={angle,edges:[],name:e.name};n.groups.push(group);}group.edges.push(e.id);
  }
  n.groups.sort((a,b)=>{const ma=a.edges.some(id=>edges[id].major),mb=b.edges.some(id=>edges[id].major);return Number(mb)-Number(ma)});
  n.y=n.edges.map(e=>taggedHeight(e.tags)).sort((a,b)=>Math.abs(b)-Math.abs(a))[0]||0;
  n.name=[...new Set(n.edges.map(e=>e.name))].slice(0,3).join(' / ');
 }
 mapControls(graphNodes,active);
 const junctions=[...graphNodes.values()].filter(n=>n.edges.length>=3);
 junctions.sort((a,b)=>distance(a,{x:0,z:0})-distance(b,{x:0,z:0}));
 let outlets=[...graphNodes.values()].filter(n=>n.boundary);if(outlets.length<2&&!raw.bounds)outlets=[...graphNodes.values()].filter(n=>n.edges.length===1);
 for(const e of active)e.component=graphNodes.get(e.a).component;
 const origins=buildActivityLocations(buildings,places,active);
 return {edgeById:new Map(active.map(e=>[e.id,e])),bounds,nodes:graphNodes,edges:active,junctions,buildings,greenSpaces,places,outlets,origins,center,raw,counts};
}
export function pointOnEdge(e,t,reverse=false,lane=0){
 t=Math.max(0,Math.min(e.length,t));let target=reverse?e.length-t:t;let i=1;while(i<e.lengths.length-1&&e.lengths[i]<target)i++;
 let a=e.points[i-1],b=e.points[i],d=e.lengths[i]-e.lengths[i-1],f=d?(target-e.lengths[i-1])/d:0,dx=(b.x-a.x)/d,dz=(b.z-a.z)/d;
 if(reverse){dx=-dx;dz=-dz;}const shift=(e.forward&&e.backward?2.2:-(e.lanes-1)*1.7)+(lane*3.4);
 return {y:roadHeight(e,target),x:a.x+(b.x-a.x)*f-dz*shift,z:a.z+(b.z-a.z)*f+dx*shift,angle:Math.atan2(dx,dz)};
}
export function route(world,start,end){if(start===end)return null;return findRoute(world,start,end);}
