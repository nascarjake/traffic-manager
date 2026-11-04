// One fresh fix per load or explicit retry. No continuous location tracking or coordinate logging.
export function locationCenter(position){
 const lat=position?.coords?.latitude,lon=position?.coords?.longitude;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)throw Error('This location is outside the supported map area.');
 return{lat,lon};
}
export class DistrictLocator{
 constructor({geolocation,permissions,onFix,onState=()=>{}}){this.geo=geolocation;this.permissions=permissions;this.onFix=onFix;this.onState=onState;this.generation=0;this.pending=null;this.suspended=false;this.disposed=false;}
 async start(){
  if(this.disposed)return;
  try{this.permission=await this.permissions?.query({name:'geolocation'});if(this.disposed)return;this.changed=()=>{if(this.permission.state==='denied'){this.cancel();this.suspended=false;this.onState('denied');}else if(this.permission.state==='granted'&&!this.suspended)this.request();};this.permission?.addEventListener('change',this.changed);}catch{}
  if(this.disposed||this.suspended)return;if(this.permission?.state==='denied'){this.onState('denied');return;}return this.request();
 }
 request(){
  if(this.disposed)return Promise.resolve();if(this.pending)return this.pending;
  this.suspended=false;const generation=++this.generation,current=()=>!this.disposed&&generation===this.generation;
  if(!this.geo?.getCurrentPosition){this.onState('unavailable');return Promise.resolve();}
  this.onState('locating');
  const fix=new Promise((resolve,reject)=>this.geo.getCurrentPosition(resolve,reject,{maximumAge:0,timeout:15000,enableHighAccuracy:true}));
  const pending=fix.then(async position=>{if(!current())return;const center=locationCenter(position);this.onState('loading');await this.onFix(center,current);if(current())this.onState('ready');}).catch(error=>{if(current())this.onState(error?.code===1?'denied':error?.code===3?'timeout':'unavailable',error);}).finally(()=>{if(this.pending===pending)this.pending=null;});
  this.pending=pending;return pending;
 }
 cancel(){this.generation++;this.pending=null;this.suspended=true;}
 dispose(){this.cancel();this.disposed=true;this.permission?.removeEventListener('change',this.changed);}
}
