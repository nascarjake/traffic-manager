import {districtBounds} from './district.js';
const limitCenter=c=>({lat:Math.max(-85,Math.min(85,c.lat)),lon:((c.lon+180)%360+360)%360-180});
export function selectedDistrict(center,radius){const pin=limitCenter(center);return{center:pin,radius:Number(radius),bounds:districtBounds(pin,Number(radius))};}
export async function mountDistrictPicker(host,initial,radius,onChange){
 await import('../vendor/leaflet.js');if(!host.isConnected)return null;
 const L=window.L,map=L.map(host,{zoomControl:true,scrollWheelZoom:true,worldCopyJump:true,minZoom:3,maxZoom:19});
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,updateWhenIdle:true,keepBuffer:1,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'});
 const icon=L.divIcon({className:'district-pin',html:'<span>⌖</span>',iconSize:[34,42],iconAnchor:[17,39]});
 const marker=L.marker([initial.lat,initial.lon],{draggable:true,keyboard:true,icon,title:'District center pin — drag or use arrow keys',alt:'District center pin'}).addTo(map),rectangle=L.rectangle([[0,0],[0,0]],{color:'#b47621',weight:2,fillColor:'#d6aa50',fillOpacity:.1,interactive:false}).addTo(map);
 let selection=selectedDistrict(initial,radius),destroyed=false;
 function update(center=selection.center,newRadius=selection.radius){selection=selectedDistrict(center,newRadius);const {lat,lon}=selection.center,b=selection.bounds;marker.setLatLng([lat,lon]);rectangle.setBounds([[b[0],b[1]],[b[2],b[3]]]);host.dataset.latitude=lat.toFixed(6);host.dataset.longitude=lon.toFixed(6);host.dataset.districtSide=String(selection.radius*2);onChange?.(structuredClone(selection));}
 function fit(){map.fitBounds(rectangle.getBounds(),{padding:[24,24],animate:false});}
 marker.on('drag',()=>{const p=marker.getLatLng();update({lat:p.lat,lon:p.lng});});map.on('click',event=>update({lat:event.latlng.lat,lon:event.latlng.lng}));

 update();fit();tiles.addTo(map);
 marker.getElement().addEventListener('keydown',event=>{const delta={ArrowUp:[1,0],ArrowDown:[-1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();const meters=event.shiftKey?100:20,dy=meters/111320,dx=dy/Math.cos(selection.center.lat*Math.PI/180);update({lat:selection.center.lat+delta[0]*dy,lon:selection.center.lon+delta[1]*dx});});
 const resize=new ResizeObserver(()=>{if(!destroyed)map.invalidateSize({pan:false});});resize.observe(host);
 return{getSelection:()=>structuredClone(selection),setCenter:center=>{update(center);fit();},setRadius:r=>{update(selection.center,r);fit();},useMapCenter:()=>{const p=map.getCenter();update({lat:p.lat,lon:p.lng});},reset:()=>{update(initial);fit();},setEnabled:enabled=>{if(destroyed)return;for(const name of['dragging','scrollWheelZoom','doubleClickZoom','touchZoom','keyboard'])map[name]?.[enabled?'enable':'disable']();marker.dragging[enabled?'enable':'disable']();host.style.pointerEvents=enabled?'':'none';},destroy:()=>{destroyed=true;resize.disconnect();map.remove();}};
}
