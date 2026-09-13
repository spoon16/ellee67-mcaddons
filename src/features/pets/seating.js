/** Read-only mount measurement; only visual entity properties are written.
 * Never teleports/ejects riders, edits blocks, replaces gear, or changes cameras.
 * Native mount skins and third-party seat implementations still require client tests.
 */
import {system} from '@minecraft/server';
import {FORM_PROPERTY,isPlayer,safeMessage} from './core.js';
import {MODEL_BY_WIRE} from './catalog.generated.js';
const SCALE=0.9375,PIXELS=16/SCALE,TRIM_KEY='pet:seat_height_trims';
const cache=new Map();
const KINDS={none:0,boat:1,pig:2,stairs:3,other:4};
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const round=x=>Math.round(x*10000)/10000;
function trims(player){try{const t=JSON.parse(player.getDynamicProperty(TRIM_KEY)??'{}');return t&&typeof t==='object'?t:{};}catch{return {};}}
function ride(player){try{return player.getComponent('minecraft:riding')?.entityRidingOn;}catch{return undefined;}}
function seats(mount){try{return mount.getComponent('minecraft:rideable')?.getSeats()??[];}catch{return [];}}
function stairSurface(player,mount){
  // Local column search only for non-native seats. Checking a nearby stair does
  // not make a standing pet sit: a live riding component is always required.
  const candidates=[];
  const centers=[mount.location,player.location];
  const visited=new Set();
  for(const p of centers){
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++){
      const pos={x:Math.floor(p.x)+dx,y:Math.floor(p.y)+dy,z:Math.floor(p.z)+dz};
      const key=`${pos.x},${pos.y},${pos.z}`;if(visited.has(key))continue;visited.add(key);
      let b;try{b=player.dimension.getBlock(pos);}catch{continue;}
      if(!b?.typeId?.endsWith('_stairs'))continue;
      let upside=false;try{upside=!!b.permutation.getState('upside_down_bit');}catch{}
      const y=pos.y+(upside?1:0.5);
      const distance=Math.hypot(mount.location.x-(pos.x+.5),mount.location.z-(pos.z+.5));
      if(distance>.85)continue;
      candidates.push({y,block:b.typeId,position:pos,score:distance+Math.abs(y-mount.location.y)*.2});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);return candidates[0];
}
export function supportFor(player,mount){
  if(!mount||mount.isValid===false)return null;
  const id=mount.typeId,p=mount.location,ss=seats(mount);
  const result={mount:id,mountY:p.y,playerY:player.location.y,seats:ss.map(s=>({x:s.position.x,y:s.position.y,z:s.position.z}))};
  if(id==='minecraft:boat'||id==='minecraft:chest_boat'||(id.startsWith('minecraft:') && /_boat$|_raft$/.test(id))){
    // Visual interior floor, not the human hip/rider anchor. Rafts are higher.
    const raft=id.endsWith('_raft');
    return {...result,kind:'boat',surfaceY:p.y+(raft?.25:.1875),source:raft?'raft deck profile':'boat interior floor profile'};
  }
  if(id==='minecraft:pig')return {...result,kind:'pig',surfaceY:p.y+1.0,source:'adult pig saddle/back profile'};
  if(!id.startsWith('minecraft:')){
    const stair=stairSurface(player,mount);
    if(stair)return {...result,kind:'stairs',surfaceY:stair.y,source:'measured stair tread',block:stair.block,blockPosition:stair.position};
  }
  const seat=ss.find(s=>Number.isFinite(s.position?.y));
  return {...result,kind:'other',surfaceY:p.y+(seat?.position.y??0),source:seat?'rideable seat anchor (unprofiled mount)':'mount origin fallback'};
}
export function calculateLift(surfaceY,playerY,trim=0){if(![surfaceY,playerY,trim].every(Number.isFinite))throw new Error('Seat measurement is not finite.');return Math.round(clamp((surfaceY-playerY)*PIXELS+trim,-64,64)*64)/64;}
/** Read-only initial alignment for a requested pet form, before its model property
 * has become readable. Transient unloaded mounts fall back to zero; polling retries.
 */
export function initialSeatProperties(player){
  const empty={'pet:seat_lift':0,'pet:seat_kind':0};
  try{
    const mount=ride(player);if(!mount)return empty;
    const r=supportFor(player,mount);if(!r)return empty;
    const t=trims(player)[r.kind]??0;
    return {'pet:seat_lift':calculateLift(r.surfaceY,player.location.y,Number.isFinite(t)?t:0),'pet:seat_kind':KINDS[r.kind]};
  }catch{return empty;}
}
function setIfDifferent(p,key,v){if(p.getProperty(key)!==v)p.setProperty(key,v);}
export function refreshSeat(player){
  if(!isPlayer(player))return false;
  const mount=MODEL_BY_WIRE[player.getProperty(FORM_PROPERTY)]?ride(player):undefined;
  if(!mount){
    if(player.getProperty('pet:seat_lift')!==undefined)setIfDifferent(player,'pet:seat_lift',0);
    if(player.getProperty('pet:seat_kind')!==undefined)setIfDifferent(player,'pet:seat_kind',0);
    cache.delete(player.id);return false;
  }
  let report=cache.get(player.id);
  // Recheck the tread at 2 Hz and immediately on seat changes. Moving mounts use
  // live relative height every update; stair switches do not wait for this cache.
  const positionKey=`${round(mount.location.x)},${round(mount.location.y)},${round(mount.location.z)}`;
  if(!report||report.mountId!==mount.id||report.positionKey!==positionKey||system.currentTick-report.tick>=10){
    report={...supportFor(player,mount),mountId:mount.id,positionKey,tick:system.currentTick};
  } else if(report.kind!=='stairs'){
    report={...report,surfaceY:report.surfaceY+(mount.location.y-report.mountY)};
  }
  const trim=trims(player)[report.kind]??0;
  const lift=calculateLift(report.surfaceY,player.location.y,Number.isFinite(trim)?trim:0);
  report={...report,mountY:mount.location.y,playerY:player.location.y,liftPixels:lift,trimPixels:trim};
  cache.set(player.id,report);
  setIfDifferent(player,'pet:seat_lift',lift);setIfDifferent(player,'pet:seat_kind',KINDS[report.kind]);
  return true;
}
export function seatInfo(player){
  const r=cache.get(player.id);
  return r?{...r,note:'Measured support/profile calculation; actual client pixels require checking.'}:{kind:'none',mount:ride(player)?.typeId??null,liftPixels:player.getProperty('pet:seat_lift')??0};
}
export function setSeatTrim(player,pixels){
  if(!Number.isInteger(pixels)||pixels< -16||pixels>32)throw new Error('Seat adjustment must be an integer from -16 to 32.');
  refreshSeat(player);const r=cache.get(player.id);if(!r)throw new Error('Ride a boat, pig, or stair seat in pet form first.');
  const t=trims(player);t[r.kind]=pixels;player.setDynamicProperty(TRIM_KEY,JSON.stringify(t));refreshSeat(player);
  safeMessage(player,`${r.kind} seat adjustment: ${pixels} pixels.`);
}
export function resetSeatTrim(player){
  refreshSeat(player);const r=cache.get(player.id);if(!r)throw new Error('Ride a seat in pet form first.');
  const t=trims(player);delete t[r.kind];player.setDynamicProperty(TRIM_KEY,JSON.stringify(t));refreshSeat(player);safeMessage(player,`${r.kind} seat adjustment reset.`);
}
export function clearSeatCache(id){cache.delete(id);}
