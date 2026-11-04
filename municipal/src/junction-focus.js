import * as THREE from 'three';
import {pointOnEdge} from './data.js';
import {connectorPose} from './motion.js';
import {ribbon,arrowGeometry} from './traffic-overlay.js';
import {junctionFocusState,FOCUS_COLORS} from './junction-focus-state.js';
const hex=value=>'#'+value.toString(16).padStart(6,'0');
function material(color,opacity=1,depthTest=true){return new THREE.MeshBasicMaterial({color,opacity,transparent:true,side:THREE.DoubleSide,depthTest,depthWrite:false,toneMapped:false});}
function sprite(width=256,height=160){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false,toneMapped:false}));mesh.scale.set(.083,.052,1);mesh.renderOrder=27;return{canvas,texture,mesh,signature:''};}
function text(ctx,value,x,y,color,size){ctx.font=`bold ${size}px monospace`;ctx.lineJoin='round';ctx.lineWidth=7;ctx.strokeStyle='#182b23';ctx.strokeText(value,x,y);ctx.fillStyle=color;ctx.fillText(value,x,y);}
function dynamicRibbon(color){const geometry=new THREE.BufferGeometry(),capacity=128*16*6*3;geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:color==='queue'?.55:.95,depthTest:color==='queue',depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));mesh.frustumCulled=false;mesh.renderOrder=color==='queue'?17:24;return{mesh,used:0};}
function appendRibbon(buffer,points,width,color,height){const positions=buffer.mesh.geometry.attributes.position,colors=buffer.mesh.geometry.attributes.color,c=new THREE.Color(color);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;for(const [p,sign]of[[a,1],[a,-1],[b,1],[b,1],[a,-1],[b,-1]]){if(buffer.used>=positions.count)return;positions.setXYZ(buffer.used,p.x+nx*sign,(p.y||0)+height,p.z+nz*sign);colors.setXYZ(buffer.used,c.r,c.g,c.b);buffer.used++;}}}
function finishRibbon(buffer){buffer.mesh.geometry.setDrawRange(0,buffer.used);buffer.mesh.geometry.attributes.position.needsUpdate=true;buffer.mesh.geometry.attributes.color.needsUpdate=true;}
export class JunctionFocus{
 constructor(scene,dispose){
  this.dispose=dispose;this.group=new THREE.Group();scene.add(this.group);this.roads=new THREE.Group();this.group.add(this.roads);this.labels=[];this.lanes=[];this.enabled=true;
  this.ring=new THREE.Mesh(new THREE.RingGeometry(29,31.1,80),material(0xffcf6d,.9,false));this.ring.rotation.x=-Math.PI/2;this.ring.renderOrder=19;this.group.add(this.ring);
  this.pulse=new THREE.Mesh(new THREE.RingGeometry(33,33.7,80),material(0xffcf6d,.55,false));this.pulse.rotation.x=-Math.PI/2;this.pulse.renderOrder=18;this.group.add(this.pulse);
  this.brackets=new THREE.Group();for(let i=0;i<4;i++){const corner=new THREE.Group();for(const [x,z,w,d]of[[0,0,9,.9],[0,4,.9,9]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.1,d),material(0xffdf8a,1,false));mesh.position.set(x,.9,z);mesh.renderOrder=20;corner.add(mesh);}corner.rotation.y=i*Math.PI/2;corner.position.set(Math.sin(i*Math.PI/2)*35,0,Math.cos(i*Math.PI/2)*35);this.brackets.add(corner);}this.group.add(this.brackets);
  this.queue=dynamicRibbon('queue');this.turns=dynamicRibbon('turn');this.group.add(this.queue.mesh,this.turns.mesh);this.tag=sprite(256,64);this.tag.mesh.scale.set(.076,.019,1);this.group.add(this.tag.mesh);this.group.visible=false;
 }
 select(node,index=0){
  for(const label of this.labels)label.texture.dispose();this.dispose(this.roads);this.labels=[];this.lanes=[];this.node=node;this.lastTime=null;this.stats={};this.queue.used=this.turns.used=0;finishRibbon(this.queue);finishRibbon(this.turns);this.group.visible=!!node;if(!node)return;
  const y=node.y||0;this.ring.position.set(node.x,y+.85,node.z);this.pulse.position.set(node.x,y+.8,node.z);this.brackets.position.set(node.x,y,node.z);this.tag.mesh.position.set(node.x,y+19,node.z);const ctx=this.tag.canvas.getContext('2d');ctx.clearRect(0,0,256,64);ctx.textAlign='center';text(ctx,`◎ J–${String(index).padStart(3,'0')}`,128,47,'#ffdf8a',46);this.tag.texture.needsUpdate=true;
 }
 build(state){
  for(const approach of state.approaches){const p=approach.path,e=p.edge,label=sprite();label.path=p;label.mesh.position.set(0,0,0);this.roads.add(label.mesh);this.labels.push(label);
   for(const lane of approach.lanes){const points=Array.from({length:17},(_,i)=>pointOnEdge(e,Math.max(0,e.length-115)+(Math.min(e.length-21,e.length*.9)-Math.max(0,e.length-115))*i/16,p.reverse,lane.lane)),bandMaterial=material(FOCUS_COLORS.stop,.14),band=new THREE.Mesh(ribbon(points,2.85,.68),bandMaterial);band.renderOrder=15;this.roads.add(band);
    const stop=pointOnEdge(e,Math.max(2,e.length-21),p.reverse,lane.lane),stopMaterial=material(FOCUS_COLORS.stop,.95),bar=new THREE.Mesh(new THREE.BoxGeometry(3.05,.12,1.05),stopMaterial);bar.rotation.y=stop.angle;bar.position.set(stop.x,.84+(stop.y||0),stop.z);bar.renderOrder=18;this.roads.add(bar);
    const glyphPoint=pointOnEdge(e,Math.max(2,e.length-35),p.reverse,lane.lane),glyphMaterial=material(FOCUS_COLORS.stop,.95),glyphs={};
    for(const movement of lane.moves){const glyph=new THREE.Group();for(const geometry of arrowGeometry(glyphPoint,movement)){const attr=geometry.attributes.position;for(let i=0;i<attr.count;i++)attr.setXYZ(i,glyphPoint.x+(attr.getX(i)-glyphPoint.x)*1.55,attr.getY(i)+.2,glyphPoint.z+(attr.getZ(i)-glyphPoint.z)*1.55);const mesh=new THREE.Mesh(geometry,glyphMaterial);mesh.renderOrder=20;glyph.add(mesh);}this.roads.add(glyph);glyphs[movement]=glyph;}
    this.lanes.push({path:p,lane:lane.lane,band,bar,glyphs,glyphMaterial});
   }
  }
 }
 update(sim,camera,now){
  this.group.visible=!!this.node;if(!this.group.visible)return;this.roads.visible=this.queue.mesh.visible=this.turns.mesh.visible=this.enabled;const beat=(Math.sin(now*3.5)+1)/2;this.ring.material.opacity=.76+beat*.2;this.pulse.scale.setScalar(1+beat*.1);this.pulse.material.opacity=.45*(1-beat*.55);this.tag.mesh.material.opacity=.88+beat*.12;if(!this.enabled)return;
  if(this.lastSim===sim&&this.lastTime!==null&&Math.abs(sim.time-this.lastTime)<.1)return;this.lastSim=sim;this.lastTime=sim.time;
  const state=junctionFocusState(sim,this.node);if(!this.labels.length)this.build(state);this.queue.used=this.turns.used=0;
  for(const [i,approach]of state.approaches.entries()){
   const label=this.labels[i],waiting=approach.waiting,turning=approach.turningLeft+approach.turningRight,signature=approach.movements.map(m=>m.state+String(m.available)).join('/')+`/${waiting}/${approach.turningLeft}/${approach.turningRight}`;
   if(signature!==label.signature){label.signature=signature;const ctx=label.canvas.getContext('2d');ctx.clearRect(0,0,256,160);ctx.textAlign='center';for(const [j,m]of approach.movements.entries())text(ctx,m.available?({left:'↰',through:'↑',right:'↱'}[m.movement]):'·',48+j*80,52,m.available?hex(FOCUS_COLORS[m.state]):'#798b78',58);text(ctx,`${waiting} WAIT`,128,105,waiting?'#ffbd59':'#e4edda',40);if(turning)text(ctx,`↰${approach.turningLeft}  ↱${approach.turningRight}`,128,149,'#65eaff',36);label.texture.needsUpdate=true;}
   const tail=Math.min(...approach.lanes.filter(l=>l.tail!==null).map(l=>l.tail)),labelDistance=Number.isFinite(tail)?Math.max(55,Math.min(125,approach.edge.length-tail+12)):68,p=pointOnEdge(approach.edge,Math.max(3,approach.edge.length-Math.min(labelDistance,approach.edge.length*.82)),approach.path.reverse,Math.max(0,(approach.edge.lanes-1)/2));label.mesh.position.set(p.x,3+(p.y||0),p.z);
   for(const lane of approach.lanes){const record=this.lanes.find(r=>r.path.edge===approach.edge&&r.lane===lane.lane),color=FOCUS_COLORS[lane.permission.state];record.band.material.color.setHex(color);record.band.material.opacity=lane.permission.state==='go'?.24:.13;record.bar.material.color.setHex(color);record.glyphMaterial.color.setHex(color);for(const [move,glyph]of Object.entries(record.glyphs))glyph.visible=move===lane.movement;
    if(lane.waiting.length){const start=Math.max(0,lane.tail-4),end=Math.min(approach.edge.length-19,lane.front+4),points=Array.from({length:13},(_,i)=>pointOnEdge(approach.edge,start+(end-start)*i/12,approach.path.reverse,lane.lane));appendRibbon(this.queue,points,2.7,FOCUS_COLORS.waiting,.94);}
   }
  }
  for(const car of state.turns.slice(0,128)){const curve=car.turn.curve,start=Math.max(0,car.turn.distance-15),end=Math.min(curve.length,car.turn.distance+3),points=Array.from({length:13},(_,i)=>connectorPose(curve,start+(end-start)*i/12));appendRibbon(this.turns,points,2.1,car.speed<.7?FOCUS_COLORS.waiting:FOCUS_COLORS.turning,1.05);}
  finishRibbon(this.queue);finishRibbon(this.turns);this.stats={node:this.node.id,approaches:state.approaches.length,lanes:this.lanes.length,waiting:state.waiting,turning:state.turning,queueVertices:this.queue.used,turnVertices:this.turns.used,permissions:state.approaches.map(a=>({edge:a.edge.id,waiting:a.waiting,left:a.turningLeft,right:a.turningRight,outputs:a.movements.map(m=>({movement:m.movement,state:m.state,available:m.available}))}))};
 }
}
