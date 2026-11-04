import {createJunctionDrill,drillResult} from './junction-drill.js';
import {defaultPlan,validatePlan} from './simulation.js';
export function matchedVerdict(before,after){
 const b=before.clearance,a=after.clearance,bq=before.peakRoadQueue??before.peakQueue,aq=after.peakRoadQueue??after.peakQueue;
 if(b!==null&&a===null)return 'Worse · your plan did not clear the wave';
 if(b===null&&a!==null)return 'Improved · your plan cleared the whole wave';
 if(b===null&&a===null)return after.cleared>before.cleared?'Improved throughput · neither wave fully cleared':after.cleared<before.cleared?'Worse throughput · neither wave fully cleared':'Neither wave fully cleared · compare queues and delay';
 const delta=b-a;if(Math.abs(delta)<.05)return aq<bq?'Same clearance time · smaller peak queue':aq>bq?'Same clearance time · larger peak queue':'No change in clearance or peak queue';
 return `${delta>0?'Improved':'Slower'} · ${Math.abs(delta).toFixed(1)}s ${delta>0?'faster':'slower'} clearance${delta>0&&aq>bq?' · larger peak queue':''}`;
}
export async function evaluateMatchedWave(world,plans,node,{count=30,mix='mixed',candidate,original=defaultPlan(node),onProgress=()=>{},yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 if(!validatePlan(candidate,node)||!validatePlan(original,node))throw Error('Check the timing program before comparing.');
 // Snapshot all inputs before yielding. Changes to the live district cannot affect either run.
 const snapshot=structuredClone(world),settings=structuredClone(plans),beforePlan=structuredClone(original),afterPlan=structuredClone(candidate),id=node.id;
 const run=async(plan,label)=>{
  const copy=structuredClone(snapshot),junction=copy.nodes.get(id),programs=structuredClone(settings);programs.set(id,plan);
  const sim=createJunctionDrill(copy,programs,junction,{count,mix});let peakQueue=0,peakRoadQueue=0,peakEntry=sim.pendingTrips.length,queueIntegral=0;const series=[];
  for(let step=0;step<1800;step++){
   sim.step(.1);const road=sim.cars.filter(c=>c.speed<.7).length,entry=sim.pendingTrips.length,total=road+entry;peakQueue=Math.max(peakQueue,total);peakRoadQueue=Math.max(peakRoadQueue,road);peakEntry=Math.max(peakEntry,entry);queueIntegral+=total*.1;
   if(step%10===9)series.push({time:(step+1)/10,road,entry,total,cleared:sim.completed});
   if(sim.completed===sim.drill.count)break;
   if(step%100===99){onProgress({run:label,seconds:Math.round(sim.time)});await yieldTask();}
  }
  const r=drillResult(sim);return{...r,finished:true,clearance:r.cleared===r.total?Math.round(sim.time*10)/10:null,peakQueue,peakRoadQueue,peakEntry,meanQueue:queueIntegral/sim.time,endRoadQueue:sim.cars.filter(c=>c.speed<.7).length,endEntry:sim.pendingTrips.length,series};
 };
 const before=await run(beforePlan,'before'),after=await run(afterPlan,'after');return{before,after,verdict:matchedVerdict(before,after),count:before.total,mix,original:beforePlan,candidate:afterPlan};
}
