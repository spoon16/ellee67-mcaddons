/** Opt-in diagnostic controls. No item, camera, or physics APIs are used here. */
import {isPlayer} from './core.js';
export const VIEW_PROPERTY='pet:view';
export const VIEW_PREFERENCE='pet:first_person_view';
export const MOTION_PROPERTY='pet:motion';
export const MOTION_PREFERENCE='pet:motion_enabled';
export const HAND_HEIGHT_PROPERTY='pet:hand_height';
export const HAND_HEIGHT_PREFERENCE='pet:hand_height_preference';
export function validateHandHeight(value){
  if(!Number.isInteger(value)||value < -8||value > 12)throw new Error('Hand height must be an integer from -8 to 12. Use 0 to reset.');
  return value;
}
export function preferredHandHeight(player){
  const v=player.getDynamicProperty(HAND_HEIGHT_PREFERENCE);
  return Number.isInteger(v)&&v>=-8&&v<=12?v:0;
}
export function preferredView(player) {
  return player.getDynamicProperty(VIEW_PREFERENCE)==='native' ? 'native' : 'paws';
}
export function preferredMotion(player) {
  return player.getDynamicProperty(MOTION_PREFERENCE)!==false;
}
function apply(player, property, key, value, persist) {
  if (!isPlayer(player)) throw new Error('The player is no longer connected.');
  const before=player.getProperty(property);
  if(before===undefined)throw new Error(`${property} is missing. Activate both 0.2.1 packs.`);
  player.setProperty(property,value);
  if(persist){
    try { player.setDynamicProperty(key,value); }
    catch(error) {try {player.setProperty(property,before);}catch{} throw error;}
  }
}
export function applyView(player,value,persist=true){
  if(!['paws','native'].includes(value))throw new Error('Expected paws or native.');
  apply(player,VIEW_PROPERTY,VIEW_PREFERENCE,value,persist);
}
export function applyMotion(player,value,persist=true){
  if(typeof value!=='boolean')throw new Error('Motion must be a boolean.');
  apply(player,MOTION_PROPERTY,MOTION_PREFERENCE,value,persist);
}
export function applyHandHeight(player,value,persist=true){
  apply(player,HAND_HEIGHT_PROPERTY,HAND_HEIGHT_PREFERENCE,validateHandHeight(value),persist);
}
export function restoreSettings(player){
  applyView(player,preferredView(player),false);
  applyMotion(player,preferredMotion(player),false);
  applyHandHeight(player,preferredHandHeight(player),false);
}
