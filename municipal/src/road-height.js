// Tag-derived deck offsets are visual estimates, not surveyed elevations.
export function taggedHeight(tags={}){const layer=Number(tags.layer);if(Number.isFinite(layer)&&layer!==0)return Math.max(-3,Math.min(3,layer))*6.2;if(tags.bridge&&tags.bridge!=='no')return 6.2;if(tags.tunnel&&tags.tunnel!=='no')return-6.2;return 0;}
export function roadHeight(e,distance){const a=e.points?.[0]?.y??taggedHeight(e.tags),b=e.points?.at(-1)?.y??taggedHeight(e.tags),t=Math.max(0,Math.min(1,distance/(e.length||1)));return a+(b-a)*t;}
