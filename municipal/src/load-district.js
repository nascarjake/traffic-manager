import {districtBounds,districtTiles} from './district.js';
export async function fetchDistrict(center,radius=900,{fetcher=fetch,signal,onProgress=()=>{}}={}){
 const dy=radius/111320,dx=dy/Math.cos(center.lat*Math.PI/180),tiles=districtTiles(center,radius),elements=new Map();
 for(const [i,bbox]of tiles.entries()){
  signal?.throwIfAborted();onProgress(`Loading nearby streets · ${i+1}/${tiles.length}`);
  const res=await fetcher(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.join(',')}`,{signal});
  if(!res.ok)throw Error(`OpenStreetMap returned ${res.status}. Try again or choose a smaller district.`);
  const tile=await res.json();for(const element of tile.elements)if(element.type==='node'||element.type==='way')elements.set(`${element.type}/${element.id}`,element);
 }
 const raw={elements:[...elements.values()],bounds:districtBounds(center,radius),districtSide:radius*2,source:'OpenStreetMap API 0.6 · tiled map query',acquired:new Date().toISOString().slice(0,10)};
 let counts=[];
 if(center.lat>41.6&&center.lat<42.05&&center.lon>-87.95&&center.lon<-87.5){
  onProgress('Checking nearby traffic counts…');
  try{const where=`midpointlat between ${center.lat-dy*1.4} and ${center.lat+dy*1.4} AND midpointlon between ${center.lon-dx*1.4} and ${center.lon+dx*1.4}`,res=await fetcher(`https://data.cityofchicago.org/resource/gc7y-n4xa.json?$where=${encodeURIComponent(where)}&$order=timestamp%20DESC&$limit=80`,{signal});if(res.ok)counts=await res.json();}catch(error){if(signal?.aborted)throw error;}
 }
 signal?.throwIfAborted();return{raw,counts};
}
