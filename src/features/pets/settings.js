/** Per-player preferences. No item, camera or physical entity state is changed. */
import {isPlayer, preferredForm} from './core.js';
import {requireProperties} from './property_health.js';
import {MODEL_BY_ID, DEFAULT_HAND_HEIGHT} from './catalog.generated.js';
export const VIEW_PROPERTY='pet:view', VIEW_PREFERENCE='pet:first_person_view';
export const MOTION_PROPERTY='pet:motion', MOTION_PREFERENCE='pet:motion_enabled';
export const HAND_HEIGHT_PROPERTY='pet:hand_height', HAND_HEIGHT_PREFERENCE='pet:hand_height_preference';
export const GEAR_PROPERTY='pet:gear_fit', GEAR_PREFERENCE='pet:fitted_gear_preference';
export const ARMOR_PROPERTY='pet:armor_fit', ARMOR_PREFERENCE='pet:fitted_armor_preference';
export function defaultHandHeight(player) {
  return MODEL_BY_ID[preferredForm(player)]?.first_person.default_hand_height ?? DEFAULT_HAND_HEIGHT;
}
export function validateHandHeight(value) {
  if (!Number.isInteger(value)||value < -8||value > 12) throw new Error('Hand height must be an integer from -8 to 12. Default is 2; 0 is neutral. /pet:handreset restores the profile default.');
  return value;
}
export function preferredHandHeight(player) {
  const v=player.getDynamicProperty(HAND_HEIGHT_PREFERENCE);
  return Number.isInteger(v)&&v>=-8&&v<=12 ? v : defaultHandHeight(player);
}
export function preferredView(player) {return player.getDynamicProperty(VIEW_PREFERENCE)==='native'?'native':'paws';}
export function preferredMotion(player) {return player.getDynamicProperty(MOTION_PREFERENCE)!==false;}
export function preferredGear(player) {return player.getDynamicProperty(GEAR_PREFERENCE)!==false;}
export function preferredArmor(player) {return player.getDynamicProperty(ARMOR_PREFERENCE)!==false;}
function apply(player, property, key, value, persist) {
  if (!isPlayer(player)) throw new Error('The player is no longer connected.');
  const before=requireProperties(player,[property])[property];
  player.setProperty(property,value);
  if (persist) {
    try {player.setDynamicProperty(key,value);}
    catch(error) {try {player.setProperty(property,before);}catch {} throw error;}
  }
}
export function applyView(player,value,persist=true) {
  if (!['paws','native'].includes(value)) throw new Error('Expected paws or native.');
  apply(player,VIEW_PROPERTY,VIEW_PREFERENCE,value,persist);
}
export function applyMotion(player,value,persist=true) {
  if (typeof value!=='boolean') throw new Error('Motion must be a boolean.');
  apply(player,MOTION_PROPERTY,MOTION_PREFERENCE,value,persist);
}
export function applyArmor(player,value,persist=true) {
  if (typeof value!=='boolean') throw new Error('Armor selection must be a boolean.');
  apply(player,ARMOR_PROPERTY,ARMOR_PREFERENCE,value,persist);
}
export function applyHandHeight(player,value,persist=true) {
  apply(player,HAND_HEIGHT_PROPERTY,HAND_HEIGHT_PREFERENCE,validateHandHeight(value),persist);
}
export function resetHandHeight(player) {
  const old=player.getProperty(HAND_HEIGHT_PROPERTY);
  applyHandHeight(player,defaultHandHeight(player),false);
  try {player.setDynamicProperty(HAND_HEIGHT_PREFERENCE,undefined);}
  catch(error) {try {player.setProperty(HAND_HEIGHT_PROPERTY,old);}catch {} throw error;}
}
export function restoreSettings(player) {
  applyView(player,preferredView(player),false);
  applyMotion(player,preferredMotion(player),false);
  applyHandHeight(player,preferredHandHeight(player),false);
  applyArmor(player,preferredArmor(player),false);
  applyGear(player,preferredGear(player),false);
}

/** Clear only the user's armor override. An absent preference means fitted. */
export function resetArmor(player) {
  const previous=player.getProperty(ARMOR_PROPERTY);
  applyArmor(player,true,false);
  try {player.setDynamicProperty(ARMOR_PREFERENCE,undefined);}
  catch(error) {try {player.setProperty(ARMOR_PROPERTY,previous);}catch {} throw error;}
}

export function applyGear(player,value,persist=true) {if(typeof value!=='boolean')throw new Error('Gear selection must be a boolean.');apply(player,GEAR_PROPERTY,GEAR_PREFERENCE,value,persist);}
export function resetGear(player) {const old=player.getProperty(GEAR_PROPERTY);applyGear(player,true,false);try{player.setDynamicProperty(GEAR_PREFERENCE,undefined);}catch(error){try{player.setProperty(GEAR_PROPERTY,old);}catch{}throw error;}}
