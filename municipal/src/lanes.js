import {movementForPaths} from './movements.js';
export const ROAD_DEFAULTS={motorway:[29,60000],motorway_link:[16,18000],trunk:[24,38000],trunk_link:[14,14000],primary:[15.6,24000],primary_link:[12,12000],secondary:[13.4,17000],secondary_link:[11,9000],tertiary:[11.2,9000],tertiary_link:[9,4500],residential:[8.9,1000],unclassified:[9,1800],living_street:[4.2,350]};
export function roadSpeed(e){const tag=String(e.tags?.maxspeed||''),n=parseFloat(tag);return Number.isFinite(n)&&n>0?Math.max(3,Math.min(36,n*(tag.includes('mph')?.44704:1/3.6))):(ROAD_DEFAULTS[e.tags?.highway]?.[0]||8.9);}
export function roadDaily(e){return ROAD_DEFAULTS[e.tags?.highway]?.[1]||1200;}
export function laneMovements(e,reverse,lane,imported=false){
 const count=imported?e.baseLanes||e.lanes:e.lanes;if(!imported&&e.turnBay)return lane===0?['left']:lane===count-1?['through','right']:['through'];
 const approach=e.laneApproaches?.[reverse?'backward':'forward'],tags=approach?.tags||e.tags,osmForward=approach?approach.osmForward:reverse?!e.osmAligned:e.osmAligned!==false,key=osmForward?'forward':'backward',tag=tags?.[`turn:lanes:${key}`]||(!(e.forward&&e.backward)?tags?.['turn:lanes']:null),parts=tag?.split('|');
 if(parts?.length===count&&parts[lane]&&parts[lane]!=='none'){
  const values=parts[lane].split(';'),moves=[];if(values.some(v=>/^(slight_|sharp_)?left$/.test(v)))moves.push('left');if(values.includes('through'))moves.push('through');if(values.some(v=>/^(slight_|sharp_)?right$/.test(v)))moves.push('right');if(moves.length)return moves;
 }
 if(count===1)return['left','through','right'];return lane===0?['left','through']:lane===count-1?['through','right']:['through'];
}
export function eligibleLanes(p,movement,imported=false){const count=imported?p.edge.baseLanes||p.edge.lanes:p.edge.lanes;return Array.from({length:count},(_,i)=>i).filter(i=>laneMovements(p.edge,p.reverse,i,imported).includes(movement));}
export function legalConnection(incoming,outgoing,imported=false){if(!incoming||!outgoing)return true;if(incoming.edge===outgoing.edge)return false;return eligibleLanes(incoming,movementForPaths(incoming,outgoing),imported).length>0;}
export function incomingPaths(n){return n.edges.filter(e=>e.a===n.id?e.backward:e.forward).map(edge=>({edge,reverse:edge.a===n.id}));}
export function outgoingPaths(n){return n.edges.filter(e=>e.a===n.id?e.forward:e.backward).map(edge=>({edge,reverse:edge.b===n.id}));}
