import {DistrictLocator} from './location.js';
// A fresh fix confirms the area before reusing its map. Tiny provider jitter should
// not trigger four downloads and another complete scene/simulation rebuild.
export function reusableNearby(cache,center,now=Date.now()){
 if(cache?.version!==1||!cache.raw?.elements?.length||cache.raw.districtSide!==1800||!Number.isFinite(cache.center?.lat)||!Number.isFinite(cache.center?.lon)||!Number.isFinite(cache.cachedAt)||now<cache.cachedAt||now-cache.cachedAt>86400000)return false;
 return Math.hypot((center.lat-cache.center.lat)*111320,(center.lon-cache.center.lon)*111320*Math.cos(center.lat*Math.PI/180))<=50;
}
export function beginLocationStartup({geolocation,permissions,fetchDistrict,readCache=async()=>null,writeCache=async()=>{},now=Date.now}){
 let settle;const startup={state:'locating',source:null,onState:null,onDistrict:null,initial:new Promise(resolve=>settle=resolve)};
 // Start storage in parallel with the browser fix. Rejections are optional cache misses.
 let cached=Promise.resolve().then(readCache).catch(()=>null);
 startup.locator=new DistrictLocator({geolocation,permissions,onState:(state,error)=>{startup.state=state;startup.error=error;if(['denied','timeout','unavailable'].includes(state)){startup.abort?.abort();settle(null);}if(state==='locating')startup.progress=null;startup.onState?.(state,error);},onFix:async(center,current)=>{
  const cache=await cached;if(!current())return;
  const abort=new AbortController();startup.abort?.abort();startup.abort=abort;const timer=setTimeout(()=>abort.abort(),90000);
  try{
   const reused=reusableNearby(cache,center,now()),data=reused?cache:await fetchDistrict(center,900,{signal:abort.signal,onProgress:message=>{if(current()&&!abort.signal.aborted){startup.progress=message;startup.onState?.('loading');}}});
   if(!current()||abort.signal.aborted)return;
   const source={...data,center:reused?cache.center:center,fromCache:reused};
   // Applying/validating is delegated to the game once it has a renderer.
   await startup.onDistrict?.(source,current);if(!current())return;startup.source=source;
  }finally{clearTimeout(timer);if(startup.abort===abort)startup.abort=null;}
 }});
 startup.remember=source=>{const entry={...source,version:1,cachedAt:now()};cached=Promise.resolve(entry);return Promise.resolve().then(()=>writeCache(entry)).catch(()=>{});};
 startup.skip=()=>{startup.locator.cancel();startup.abort?.abort();settle(null);};
 startup.dispose=()=>{startup.skip();startup.locator.dispose();};
 startup.locator.start().finally(()=>settle(startup.source));
 return startup;
}
