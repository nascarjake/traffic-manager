import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {mergeGeometries} from 'three/addons/BufferGeometryUtils.js';
import {pointOnEdge,distance} from './data.js';
const COLORS=[0xeee9d5,0xbaceb7,0xcfad67,0x76918b,0xe1d4ae,0x626f65,0xb97956,0xdddcc8];
export class WorldRenderer{
 constructor(host,labels,onSelect){
  this.host=host;this.labels=labels;this.onSelect=onSelect;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c2cdb9');this.scene.fog=new THREE.Fog('#c2cdb9',1500,3100);
  this.camera=new THREE.PerspectiveCamera(34,1,1,5000);this.camera.position.set(540,670,670);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.8));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;host.append(this.renderer.domElement);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=130;this.controls.maxDistance=1900;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minPolarAngle=.03;this.controls.enablePan=true;
  this.scene.add(new THREE.HemisphereLight(0xf0f3df,0x788a6c,1.4));const sun=new THREE.DirectionalLight(0xffefd1,2.1);sun.position.set(-400,650,250);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-850;sun.shadow.camera.right=850;sun.shadow.camera.top=850;sun.shadow.camera.bottom=-850;sun.shadow.camera.near=1;sun.shadow.camera.far=1800;sun.shadow.bias=-.0007;sun.shadow.normalBias=.8;this.scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:0xb0c0a1,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.2;ground.receiveShadow=true;this.scene.add(ground);
  const grid=new THREE.GridHelper(2400,48,0xa5b79a,0xaec0a2);grid.position.y=-.1;grid.material.transparent=true;grid.material.opacity=.23;this.scene.add(grid);
  this.static=new THREE.Group();this.scene.add(this.static);this.roadGroup=new THREE.Group();this.scene.add(this.roadGroup);this.signalGroup=new THREE.Group();this.scene.add(this.signalGroup);
  this.cars=new THREE.InstancedMesh(new THREE.BoxGeometry(1.85,1.4,4.4),new THREE.MeshStandardMaterial({roughness:.75}),1200);this.cars.castShadow=true;this.scene.add(this.cars);
  this.roofs=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.42,2.2),new THREE.MeshStandardMaterial({color:0x334741,roughness:.45}),1200);this.scene.add(this.roofs);
  this.dummy=new THREE.Object3D();this.signals=[];this.streetLabels=[];this.markers=[];this.trafficLayer=true;this.showLabels=true;
  this.selection=new THREE.Mesh(new THREE.RingGeometry(17,18.1,64),new THREE.MeshBasicMaterial({color:0xf3c46b,side:THREE.DoubleSide}));this.selection.rotation.x=-Math.PI/2;this.selection.position.y=.75;this.scene.add(this.selection);
  this.selection2=new THREE.Mesh(new THREE.RingGeometry(22,22.35,64),new THREE.MeshBasicMaterial({color:0xf1cc81,transparent:true,opacity:.7,side:THREE.DoubleSide}));this.selection2.rotation.x=-Math.PI/2;this.selection2.position.y=.7;this.scene.add(this.selection2);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
  let down;host.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});host.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5||e.button!==0||!this.world)return;const r=host.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);let p=new THREE.Vector3();if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),p)){let n=this.world.junctions.reduce((a,n)=>!a||distance(n,{x:p.x,z:p.z})<distance(a,{x:p.x,z:p.z})?n:a,null);if(n&&distance(n,{x:p.x,z:p.z})<55)this.onSelect(n);}});
 }
 resize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 disposeGroup(group){for(const child of [...group.children]){child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose());else child.material?.dispose();group.remove(child);}}
 load(world){
  this.world=world;this.disposeGroup(this.static);this.disposeGroup(this.signalGroup);this.labels.innerHTML='';this.streetLabels=[];this.markers=[];this.signals=[];
  const buildingGeos=[[],[],[]];let bindex=0;
  for(const b of world.buildings){if(Math.abs(b.center.x)>630||Math.abs(b.center.z)>550)continue;
   const shape=new THREE.Shape();b.points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));
   let h=parseFloat(b.tags.height)||(+b.tags['building:levels']||2+(b.id%3))*3.4;h=Math.min(75,Math.max(4,h));b.height=h;
   try{const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);g.translate(0,.3,0);buildingGeos[bindex++%3].push(g);}catch{}
  }
  this.buildingMeshes=[];for(let i=0;i<3;i++)if(buildingGeos[i].length){const merged=mergeGeometries(buildingGeos[i]);const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color:[0xd8d7bd,0xc7c9ae,0xe3ddc5][i],roughness:1}));mesh.castShadow=true;mesh.receiveShadow=true;this.static.add(mesh);this.buildingMeshes.push(mesh);buildingGeos[i].forEach(g=>g.dispose());}
  // Low, pale rooftop outlines make the footprint extrusion read like a scale model.
  const roofPositions=[];for(const b of world.buildings)if(b.height)for(let i=1;i<b.points.length;i++){let a=b.points[i-1],p=b.points[i];roofPositions.push(a.x,b.height+.4,a.z,p.x,b.height+.4,p.z);}
  const roofgeo=new THREE.BufferGeometry();roofgeo.setAttribute('position',new THREE.Float32BufferAttribute(roofPositions,3));this.outlines=new THREE.LineSegments(roofgeo,new THREE.LineBasicMaterial({color:0xe9e4cd,transparent:true,opacity:.55}));this.static.add(this.outlines);
  // Procedural street trees, placed beside roads with a building-footprint clearance.
  const trees=[];for(const e of world.edges)if(e.length>45)for(let t=28;t<e.length-15;t+=35){let p=pointOnEdge(e,t,false);let next=pointOnEdge(e,Math.min(t+1,e.length),false);let dx=next.x-p.x,dz=next.z-p.z;for(const side of [-1,1]){const x=p.x-dz*side*11,z=p.z+dx*side*11;if(!world.buildings.some(b=>distance(b.center,{x,z})<Math.sqrt(b.area)*.45+3))trees.push({x,z,s:2.5+(Math.abs(x*z)%18)/10});}}
  const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x6f8c59,roughness:1}),trees.length);const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.35,.5,4,4),new THREE.MeshStandardMaterial({color:0x8c8970}),trees.length);
  trees.forEach((p,i)=>{this.dummy.position.set(p.x,5.2,p.z);this.dummy.scale.set(p.s,p.s*1.2,p.s);this.dummy.rotation.set(0,i,0);this.dummy.updateMatrix();foliage.setMatrixAt(i,this.dummy.matrix);this.dummy.position.y=2;this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();trunks.setMatrixAt(i,this.dummy.matrix)});foliage.castShadow=true;this.static.add(foliage,trunks);
  this.buildRoads();
  const byName=new Map();for(const e of [...world.edges].sort((a,b)=>b.length-a.length)){if(e.name==='Local street'||byName.has(e.name))continue;byName.set(e.name,e);if(byName.size>13)break;}
  for(const [name,e] of byName){const p=pointOnEdge(e,e.length*.45);const el=document.createElement('div');el.className='street-label';el.textContent=name.replace(/^North /,'N ').replace(/^West /,'W ').toUpperCase();this.labels.append(el);this.streetLabels.push({el,p:new THREE.Vector3(p.x,2,p.z)});}
  for(const [i,n] of world.junctions.entries()){
   const el=document.createElement('button');el.className='junction-marker';el.title=n.name;el.setAttribute('aria-label',`Inspect ${n.name}`);el.textContent=n.control==='signal'?'⫶':'·';el.classList.toggle('stop-marker',n.control==='stop');el.onclick=()=>this.onSelect(n);this.labels.append(el);this.markers.push({el,n,p:new THREE.Vector3(n.x,7,n.z)});
   if(n.control==='signal')this.addSignal(n);
  }
  this.home();
 }
 addSignal(n){for(let i=0;i<Math.min(n.edges.length,4);i++){const e=n.edges[i],p=pointOnEdge(e,e.a===n.id?14:e.length-14);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,7,4),new THREE.MeshStandardMaterial({color:0x52614e}));pole.position.set(p.x,3.5,p.z);this.signalGroup.add(pole);const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.7,1.2),new THREE.MeshStandardMaterial({color:0x354832}));lamp.position.set(p.x,7,p.z);this.signalGroup.add(lamp);const light=new THREE.Mesh(new THREE.SphereGeometry(.45,5,4),new THREE.MeshBasicMaterial({color:0x94b878}));light.position.set(p.x,7.3,p.z-.7);this.signalGroup.add(light);this.signals.push({light,node:n.id,edge:e.id});}}
 buildRoads(){
  this.disposeGroup(this.roadGroup);const surf=[],pavement=[],mark=[],line=[];this.roadMeshes=[];
  function strip(e,width,y){const pos=[];for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i],d=distance(a,b),nx=-(b.z-a.z)/d*width/2,nz=(b.x-a.x)/d*width/2;pos.push(a.x+nx,y,a.z+nz,a.x-nx,y,a.z-nz,b.x+nx,y,b.z+nz,b.x+nx,y,b.z+nz,a.x-nx,y,a.z-nz,b.x-nx,y,b.z-nz);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;}
  for(const e of this.world.edges){
   const width=(e.forward&&e.backward?e.lanes*2:e.lanes)*3.4+3;
   pavement.push(strip(e,width+5,.04));const road=new THREE.Mesh(strip(e,width,.15),new THREE.MeshStandardMaterial({color:0x46534a,roughness:1,side:THREE.DoubleSide}));road.receiveShadow=true;this.roadGroup.add(road);this.roadMeshes.push({e,mesh:road});
   for(let t=17;t<e.length-14;t+=10){const a=pointOnEdge(e,t),b=pointOnEdge(e,t+4);const dx=Math.sin(a.angle),dz=Math.cos(a.angle);if(e.forward&&e.backward){const shift=2.2;line.push(a.x+dz*shift,.23,a.z-dx*shift,b.x+dz*shift,.23,b.z-dx*shift);}
    if(e.lanes>1){const a1=pointOnEdge(e,t,false,0),b1=pointOnEdge(e,t+4,false,0);mark.push(a1.x-dz*1.7,.23,a1.z+dx*1.7,b1.x-dz*1.7,.23,b1.z+dx*1.7);if(e.backward&&e.forward){const a2=pointOnEdge(e,t,true,0),b2=pointOnEdge(e,t+4,true,0);mark.push(a2.x+dz*1.7,.23,a2.z-dx*1.7,b2.x+dz*1.7,.23,b2.z-dx*1.7);}}
   }
  }
  if(pavement.length){const mesh=new THREE.Mesh(mergeGeometries(pavement),new THREE.MeshStandardMaterial({color:0xc1c7ae,roughness:1,side:THREE.DoubleSide}));mesh.receiveShadow=true;this.roadGroup.add(mesh);pavement.forEach(g=>g.dispose());}
  for(const [positions,color,opacity] of [[line,0xd9c990,.8],[mark,0xdfdebd,.65]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.roadGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity})));}
  // Zebra crossings on controlled junction approaches.
  const zebras=[];for(const n of this.world.junctions)for(const e of n.edges){if(e.length<40)continue;const reverse=e.b===n.id;const p=pointOnEdge(e,reverse?e.length-14:14);let a=e.a===n.id?e.points[0]:e.points.at(-1),b=e.a===n.id?e.points[1]:e.points.at(-2),d=distance(a,b),dx=(b.x-a.x)/d,dz=(b.z-a.z)/d;for(let j=-3;j<=3;j++){const g=new THREE.PlaneGeometry(.9,3.7);g.rotateX(-Math.PI/2);g.rotateY(Math.atan2(dx,dz));g.translate(n.x+dx*14-dz*j*1.5,.28,n.z+dz*14+dx*j*1.5);zebras.push(g);}}
  if(zebras.length){const m=new THREE.Mesh(mergeGeometries(zebras),new THREE.MeshBasicMaterial({color:0xd3d4b7,side:THREE.DoubleSide}));this.roadGroup.add(m);zebras.forEach(g=>g.dispose());}
 }
 select(n){this.selected=n;this.selection.position.set(n.x,.8,n.z);this.selection2.position.set(n.x,.8,n.z);for(const m of this.markers)m.el.classList.toggle('selected',m.n===n);}
 home(){this.controls.target.set(0,0,-45);this.camera.position.set(400,520,475);this.controls.update();}
 planView(plan){const target=this.controls.target.clone();this.camera.position.copy(target).add(plan?new THREE.Vector3(0,900,1):new THREE.Vector3(400,520,520));this.controls.update();}
 zoom(f){this.camera.position.sub(this.controls.target).multiplyScalar(f).add(this.controls.target);this.controls.update();}
 screen(v){const p=v.clone().project(this.camera);return {x:(p.x+1)*this.host.clientWidth/2,y:(1-p.y)*this.host.clientHeight/2,visible:p.z<1&&p.x>-1.2&&p.x<1.2&&p.y>-1.2&&p.y<1.2};}
 render(sim){
  this.controls.update();const dummy=this.dummy;dummy.scale.set(1,1,1);let count=0;
  for(const c of sim.cars){if(count>=1200)break;const p=c.path[c.index],v=pointOnEdge(p.edge,c.position,p.reverse,c.lane);dummy.position.set(v.x,1.15,v.z);dummy.rotation.set(0,v.angle,0);dummy.updateMatrix();this.cars.setMatrixAt(count,dummy.matrix);this.cars.setColorAt(count,new THREE.Color(COLORS[c.color]));dummy.position.y=2;dummy.updateMatrix();this.roofs.setMatrixAt(count,dummy.matrix);count++;}
  this.cars.count=count;this.roofs.count=count;this.cars.instanceMatrix.needsUpdate=true;this.roofs.instanceMatrix.needsUpdate=true;if(this.cars.instanceColor)this.cars.instanceColor.needsUpdate=true;
  if(this.trafficLayer&&this.frameCount%20===0){const densities=new Map();for(const c of sim.cars){let e=c.path[c.index].edge;if(c.speed<3)densities.set(e.id,(densities.get(e.id)||0)+1);}for(const {mesh,e} of this.roadMeshes){const q=densities.get(e.id)||0;mesh.material.color.setHex(q>6?0x95674d:q>2?0x827e50:0x465b4d);}}
  this.frameCount=(this.frameCount||0)+1;
  for(const {light,node,edge} of this.signals){let c=sim.controllers.get(node);light.material.color.setHex(c?.plan.control==='stop'?0xc69b66:c?.stage==='yellow'&&c.node.groups[c.phase]?.edges.includes(edge)?0xeec061:c?.allows(edge)?0xa9cc82:0xd87958);}
  const zoom=this.camera.position.distanceTo(this.controls.target);for(const l of this.streetLabels){const p=this.screen(l.p);l.el.style.display=this.showLabels&&p.visible?'block':'none';l.el.style.left=p.x+'px';l.el.style.top=p.y+'px';}
  for(const m of this.markers){const p=this.screen(m.p);m.el.style.display=p.visible&&(m.n===this.selected||(distance(m.n,{x:this.controls.target.x,z:this.controls.target.z})<(m.n.control==='signal'?360:170)&&zoom<1250))?'grid':'none';m.el.style.left=p.x+'px';m.el.style.top=p.y+'px';if(this.frameCount%25===0)m.el.classList.toggle('queued',sim.queueAt(m.n.id)>3);}
  const tag=document.getElementById('selected-tag');if(this.selected){const p=this.screen(new THREE.Vector3(this.selected.x,0,this.selected.z));tag.style.display=p.visible?'block':'none';tag.style.left=(p.x+23)+'px';tag.style.top=(p.y+15)+'px';}
  this.renderer.render(this.scene,this.camera);
 }
 setBuildings(on){this.buildingMeshes?.forEach(m=>m.visible=on);if(this.outlines)this.outlines.visible=on;}
 setTraffic(on){this.trafficLayer=on;if(!on)for(const {mesh} of this.roadMeshes)mesh.material.color.setHex(0x46534a);}
}
