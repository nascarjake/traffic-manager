import {updateInstanceRange} from './render-resources.js';
import {vehicleInJunctionFocus} from './junction-focus-state.js';
import * as THREE from 'three';
import {carPose} from './motion.js';
import {vehicleCue,TRAFFIC_COLORS} from './traffic-state.js';
function arrow(move){const s=new THREE.Shape(),points=move==='through'?[[-.18,-.6],[.18,-.6],[.18,.12],[.52,.12],[0,.72],[-.52,.12],[-.18,.12]]:[[-.18,-.65],[.18,-.65],[.18,.2],[.56,.2],[.56,-.05],[1,.38],[.56,.8],[.56,.55],[-.18,.55]];for(const [i,[x,z]]of points.entries())i?s.lineTo(move==='left'?-x:x,z):s.moveTo(move==='left'?-x:x,z);s.closePath();const g=new THREE.ShapeGeometry(s);g.rotateX(Math.PI/2);return g;}
export class VehicleCues{
 constructor(scene,capacity=6000){this.group=new THREE.Group();scene.add(this.group);this.enabled=true;this.tmp=new THREE.Object3D();this.color=new THREE.Color();this.parts={};
  const frame=new THREE.Shape();frame.moveTo(-.68,-1.23);frame.lineTo(.68,-1.23);frame.lineTo(.68,1.23);frame.lineTo(-.68,1.23);frame.closePath();const hole=new THREE.Path();hole.moveTo(-.45,-.99);hole.lineTo(-.45,.99);hole.lineTo(.45,.99);hole.lineTo(.45,-.99);hole.closePath();frame.holes.push(hole);const g=new THREE.ShapeGeometry(frame);g.rotateX(Math.PI/2);
  for(const [key,geometry]of Object.entries({frame:g,left:arrow('left'),through:arrow('through'),right:arrow('right')})){
   const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:true,opacity:key==='frame'?.88:1,toneMapped:false}),capacity);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.renderOrder=key==='frame'?23:24;this.group.add(mesh);this.parts[key]=mesh;
  }
 }
 update(cars,camera,height,selected=null){this.group.visible=this.enabled;if(!this.enabled)return;const counts={frame:0,left:0,through:0,right:0};
  for(const car of cars){const focused=vehicleInJunctionFocus(car,selected),p=carPose(car),cue=vehicleCue(car),distance=Math.hypot(camera.position.x-p.x,camera.position.y-(p.y||0),camera.position.z-p.z),perPixel=2*distance*Math.tan(camera.fov*Math.PI/360)/height,scale=Math.max(3.2,Math.min(32,perPixel*6.2));this.tmp.position.set(p.x,3+(p.y||0),p.z);this.tmp.rotation.set(0,p.angle,0);this.tmp.scale.set(scale*(selected&&focused?1.18:1),1,scale*(selected&&focused?1.18:1));this.tmp.updateMatrix();this.color.setHex(TRAFFIC_COLORS[cue.state]).multiplyScalar(selected&&!focused?.38:1);for(const key of['frame',cue.movement]){const mesh=this.parts[key],i=counts[key]++;mesh.setMatrixAt(i,this.tmp.matrix);mesh.setColorAt(i,this.color);}}
  for(const [key,mesh]of Object.entries(this.parts)){updateInstanceRange(mesh,counts[key]);}
 }
}
