export const CAMERA_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyZ','KeyX']);
export const TIME_SPEEDS=[1,3,10];
export const TRAFFIC_PRESETS=[{label:'Quiet',demand:.5,count:10},{label:'Normal',demand:1,count:30},{label:'Busy',demand:1.5,count:60},{label:'Rush',demand:2.5,count:120}];
export function cameraBasis(offset){const length=Math.hypot(offset.x,offset.z)||1,forward={x:-offset.x/length,z:-(offset.z||(!offset.x?1:0))/length};return{forward,right:{x:-forward.z,z:forward.x}};}
export function cameraMotion(keys,offset,dt){
 const time=Math.max(0,Math.min(.1,dt)),radius=Math.hypot(offset.x,offset.y,offset.z),boost=keys.has('ShiftLeft')||keys.has('ShiftRight')?2.5:1,{forward,right}=cameraBasis(offset),x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),y=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),length=Math.hypot(x,y)||1,rate=radius*.62*time*boost;
 return{pan:{x:(right.x*x+forward.x*y)/length*rate,z:(right.z*x+forward.z*y)/length*rate},yaw:(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))*time*.95*boost,zoom:Math.exp((Number(keys.has('KeyX'))-Number(keys.has('KeyZ')))*time*1.15*boost)};
}
export function nearestJunction(nodes,anchor,excluded=null){return nodes.filter(n=>n.id!==excluded).sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z)||String(a.id).localeCompare(String(b.id)))[0]||null;}
export function directionalJunction(nodes,anchor,direction,offset,excluded=null){
 const {forward,right}=cameraBasis(offset),axis={up:forward,down:{x:-forward.x,z:-forward.z},left:{x:-right.x,z:-right.z},right}[direction];if(!axis)return null;
 return nodes.filter(n=>n.id!==excluded).map(node=>{const dx=node.x-anchor.x,dz=node.z-anchor.z,distance=Math.hypot(dx,dz),alignment=distance?(dx*axis.x+dz*axis.z)/distance:0;return{node,alignment,score:distance*(1+.3*(1-alignment))};}).filter(n=>n.alignment>=.5).sort((a,b)=>a.score-b.score||String(a.node.id).localeCompare(String(b.node.id)))[0]?.node||null;
}
export class JunctionCycle{
 reset(){this.order=null;this.cursor=-1;}
 constructor(){this.reset();}
 next(nodes,anchor,currentId=null,reverse=false){
  if(!this.order||this.order.length!==nodes.length||this.order.some(n=>!nodes.includes(n))){this.order=[...nodes].sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z)||String(a.id).localeCompare(String(b.id)));this.cursor=this.order.findIndex(n=>n.id===currentId);if(this.cursor!==0){this.cursor=0;return this.order[this.cursor]||null;}}
  if(!this.order.length)return null;this.cursor=(this.cursor+(reverse?-1:1)+this.order.length)%this.order.length;return this.order[this.cursor];
 }
}
export function shortcut(code,{shift=false,repeat=false,navigationFocus=true}={}){
 if(CAMERA_KEYS.has(code)||code==='ShiftLeft'||code==='ShiftRight')return{kind:'camera'};
 if(repeat)return null;
 if(code==='Tab')return navigationFocus?{kind:'cycle',reverse:shift}:null;
 const directions={KeyI:'up',KeyJ:'left',KeyK:'down',KeyL:'right'};if(directions[code])return{kind:'direction',direction:directions[code]};
 const digit=Number(code.match(/^(?:Digit|Numpad)(\d)$/)?.[1]);if(digit>=1&&digit<=3)return{kind:'speed',speed:TIME_SPEEDS[digit-1]};if(digit>=4&&digit<=7)return{kind:'traffic',preset:TRAFFIC_PRESETS[digit-4]};
 return({KeyM:{kind:'district'},KeyV:{kind:'watch'},KeyF:{kind:'nearest'},Enter:{kind:shift?'apply':'inspect'},NumpadEnter:{kind:shift?'apply':'inspect'},Escape:{kind:'escape'},Space:{kind:'pause'},Digit0:{kind:'pause'},Numpad0:{kind:'pause'},KeyT:{kind:'drill'},KeyR:{kind:'report'},KeyH:{kind:'help'},Slash:shift?{kind:'help'}:null})[code]||null;
}
export function currentDistrictRadius(world){const bounds=world.raw.bounds,side=world.raw.districtSide||(Array.isArray(bounds)?Math.abs(bounds[2]-bounds[0])*111320:Math.max(world.bounds.maxX-world.bounds.minX,world.bounds.maxZ-world.bounds.minZ));return[450,900,1350].sort((a,b)=>Math.abs(a-side/2)-Math.abs(b-side/2))[0];}
