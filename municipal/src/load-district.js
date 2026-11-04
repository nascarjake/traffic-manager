import {districtBounds,districtTiles} from './district.js';
export async function fetchDistrict(center,radius=900,{fetcher=fetch,signal,onProgress=()=>{}}={}){
 const dy=radius/111320,dx=dy/Math.cos(center.lat*Math.PI/180),tiles=districtTiles(center,radius),elements=new Map(),results=new Array(tiles.length),abort=new AbortController();
 const cancel=()=>abort.abort(signal?.reason);if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const requestSignal=abort.signal;let next=0,completed=0;
 async function worker(){while(next<tiles.length){requestSignal.throwIfAborted();const index=next++,bbox=tiles[index];onProgress(`Loading nearby streets · ${completed}/${tiles.length}`);
  const res=await fetcher(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox.join(',')}`,{signal:requestSignal});
  if(!res.ok)throw Error(`OpenStreetMap returned ${res.status}. Try again or choose a smaller district.`);
  results[index]=await res.json();completed++;onProgress(`Loading nearby streets · ${completed}/${tiles.length}`);
 }}
 async function observations(){
  if(!(center.lat>41.6&&center.lat<42.05&&center.lon>-87.95&&center.lon<-87.5))return[];
  try{requestSignal.throwIfAborted();const where=`midpointlat between ${center.lat-dy*1.4} and ${center.lat+dy*1.4} AND midpointlon between ${center.lon-dx*1.4} and ${center.lon+dx*1.4}`,res=await fetcher(`https://data.cityofchicago.org/resource/gc7y-n4xa.json?$where=${encodeURIComponent(where)}&$order=timestamp%20DESC&$limit=80`,{signal:requestSignal});return res.ok?await res.json():[];}catch(error){if(requestSignal.aborted)throw error;return[];}
 }
 try{
  // Two map requests at a time; observations load alongside them. Merge in tile
  // order so network completion order cannot change seeded simulation inputs.
  const [counts]=await Promise.all([observations(),...Array.from({length:Math.min(2,tiles.length)},()=>worker())]);
  requestSignal.throwIfAborted();for(const tile of results)for(const element of tile.elements)if(element.type==='node'||element.type==='way')elements.set(`${element.type}/${element.id}`,element);
  const raw={elements:[...elements.values()],bounds:districtBounds(center,radius),districtSide:radius*2,source:'OpenStreetMap API 0.6 · tiled map query',acquired:new Date().toISOString().slice(0,10)};
  return{raw,counts};
 }finally{abort.abort();signal?.removeEventListener('abort',cancel);}
}
