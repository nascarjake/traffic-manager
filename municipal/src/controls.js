// OSM sign directions follow the original way, never the simplified graph traversal.
const TYPES=new Set(['traffic_signals','stop','give_way']);
export function mapControls(nodes,edges){
 for(const n of nodes.values()){
  n.approaches={};n.controlEvidence=[];
  const central=(n.members||[n]).filter(p=>TYPES.has(p.tags?.highway));
  const evidence=[];
  for(const e of n.edges){
   if(!(e.a===n.id?e.backward:e.forward))continue;
   const atA=e.a===n.id;
   for(const record of e.controls||[]){
    const along=atA?record.distance:e.length-record.distance;
    if(along>Math.min(record.type==='traffic_signals'?85:55,e.length*.48))continue;
    const direction=record.tags[record.type==='traffic_signals'?'traffic_signals:direction':'direction'];
    const incomingAlongEdge=!atA;
    if(['forward','backward'].includes(direction)){const followsEdge=(direction==='forward')===record.forwardAlongEdge;if(followsEdge!==incomingAlongEdge)continue;}
    evidence.push({...record,edge:e.id});
   }
  }
  n.controlEvidence=[...central.map(p=>({osmId:p.id,type:p.tags.highway,tags:p.tags,central:true})),...evidence];
  const signal=n.controlEvidence.some(p=>p.type==='traffic_signals');
  const allStop=central.some(p=>p.tags.highway==='stop'&&p.tags.stop==='all');
  const mappedStops=evidence.filter(p=>p.type==='stop'||p.type==='give_way');
  const major=n.edges.some(e=>e.major);
  n.control=signal?'signal':allStop?'stop':mappedStops.length||major?'priority':'stop';
  for(const e of n.edges){const record=mappedStops.find(p=>p.edge===e.id);n.approaches[e.id]={rule:signal?'signal':allStop?'stop':record?(record.type==='stop'?'stop':'yield'):n.control==='stop'?'stop':mappedStops.length?'priority':e.major?'priority':'yield',source:signal||allStop||record?'mapped':'modeled',osmId:record?.osmId};}
  n.controlSource=signal?'Mapped traffic signals':allStop?'Mapped all-way stop':mappedStops.length?'Mapped approach signs + modeled unsigned approaches':'No mapped control · modeled '+(n.control==='stop'?'all-way stop':'priority / yield');
 }
}
export function approachRule(controller,edgeId){return controller.plan.control==='signal'?'signal':controller.plan.control==='stop'?'stop':controller.node.approaches?.[edgeId]?.rule||'yield';}
