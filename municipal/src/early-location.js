import {beginLocationStartup} from './location-startup.js';
import {fetchDistrict} from './load-district.js';
import {readNearbyDistrict,cacheNearbyDistrict} from './district.js';
// This small independent entry starts while the WebGL module graph is downloading.
export const locationStartup=beginLocationStartup({geolocation:navigator.geolocation,permissions:navigator.permissions,fetchDistrict,readCache:readNearbyDistrict,writeCache:cacheNearbyDistrict});
locationStartup.onState=state=>{document.querySelector('#boot-status').textContent=state==='locating'?'Locating your district…':state==='loading'?locationStartup.progress||'Loading your nearby streets…':'Preparing your district…';};
document.querySelector('#boot-fallback').onclick=event=>{locationStartup.skip();event.currentTarget.disabled=true;document.querySelector('#boot-status').textContent='Opening saved / demo district…';};
