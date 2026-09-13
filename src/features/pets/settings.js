/** Per-player preferences. No item, camera or physical entity state is changed. */
import {isPlayer, preferredForm} from './core.js';
import {requireProperties} from './property_health.js';
import {MODEL_BY_ID, DEFAULT_HAND_HEIGHT} from './catalog.generated.js';
export const VIEW_PROPERTY='pet:view', VIEW_PREFERENCE='pet:first_person_view';
export const MOTION_PROPERTY='pet:motion', MOTION_PREFERENCE='pet:motion_enabled';
export const HAND_HEIGHT_PROPERTY='pet:hand_height', HAND_HEIGHT_PREFERENCE='pet:hand_height_preference';
export const GEAR_PROPERTY='pet:gear_fit', GEAR_PREFERENCE='pet:fitted_gear_preference';
export const ARMOR_PROPERTY='pet:armor_fit', ARMOR_PREFERENCE='pet:fitted_armor_preference';
export const ARMOR_LIFT_PROPERTY='pet:armor_lift', ARMOR_SCALE_PROPERTY='pet:armor_scale', ARMOR_FIT_TRIMS='pet:armor_fit_trims';
const NEUTRAL_ARMOR_FIT=Object.freeze({lift:0,scale:1});
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
  applyArmorFit(player);
}
function armorTrims(player) {
  try {const t=JSON.parse(player.getDynamicProperty(ARMOR_FIT_TRIMS)??'{}');return t&&typeof t==='object'?t:{};}
  catch {return {};}
}
/** Live fitted-armor calibration for one pet: lift in model pixels and a scale factor, applied on top of the
 * pre-scale baked into that pet's armor meshes. Saved per pet so switching forms keeps each pet's numbers. */
export function armorFitFor(player,form) {
  if (form==='human') return NEUTRAL_ARMOR_FIT;
  const t=armorTrims(player)[form];
  const lift=typeof t?.lift==='number'&&t.lift>=-16&&t.lift<=16 ? t.lift : 0;
  const scale=typeof t?.scale==='number'&&t.scale>=0.5&&t.scale<=1.5 ? t.scale : 1;
  return {lift,scale};
}
export function applyArmorFit(player,form=preferredForm(player)) {
  if (!isPlayer(player)) throw new Error('The player is no longer connected.');
  const fit=armorFitFor(player,form);
  requireProperties(player,[ARMOR_LIFT_PROPERTY,ARMOR_SCALE_PROPERTY]);
  player.setProperty(ARMOR_LIFT_PROPERTY,fit.lift);
  player.setProperty(ARMOR_SCALE_PROPERTY,fit.scale);
  return fit;
}
function writeArmorFit(player,change) {
  const form=preferredForm(player);
  if (form==='human') throw new Error('Choose a pet first; armor calibration is saved per pet.');
  const trims=armorTrims(player),previous=trims[form];
  trims[form]=change(armorFitFor(player,form));
  if (trims[form]===undefined) delete trims[form];
  player.setDynamicProperty(ARMOR_FIT_TRIMS,Object.keys(trims).length?JSON.stringify(trims):undefined);
  try {return applyArmorFit(player,form);}
  catch(error) {
    if (previous===undefined) delete trims[form]; else trims[form]=previous;
    try {player.setDynamicProperty(ARMOR_FIT_TRIMS,Object.keys(trims).length?JSON.stringify(trims):undefined);} catch {}
    throw error;
  }
}
export function setArmorLift(player,pixels) {
  if (typeof pixels!=='number'||!Number.isFinite(pixels)||pixels< -16||pixels>16) throw new Error('Armor lift must be a number from -16 to 16 model pixels; positive raises the armor. 0 is the baked position.');
  return writeArmorFit(player,fit=>({...fit,lift:Math.round(pixels*100)/100}));
}
export function setArmorScale(player,percent) {
  if (!Number.isInteger(percent)||percent<50||percent>150) throw new Error('Armor scale must be a whole percentage from 50 to 150. 100 is the baked size.');
  return writeArmorFit(player,fit=>({...fit,scale:percent/100}));
}
export function resetArmorFit(player) {return writeArmorFit(player,()=>undefined);}

/** Clear only the user's armor override. An absent preference means fitted. */
export function resetArmor(player) {
  const previous=player.getProperty(ARMOR_PROPERTY);
  applyArmor(player,true,false);
  try {player.setDynamicProperty(ARMOR_PREFERENCE,undefined);}
  catch(error) {try {player.setProperty(ARMOR_PROPERTY,previous);}catch {} throw error;}
}

export function applyGear(player,value,persist=true) {if(typeof value!=='boolean')throw new Error('Gear selection must be a boolean.');apply(player,GEAR_PROPERTY,GEAR_PREFERENCE,value,persist);}
export function resetGear(player) {const old=player.getProperty(GEAR_PROPERTY);applyGear(player,true,false);try{player.setDynamicProperty(GEAR_PREFERENCE,undefined);}catch(error){try{player.setProperty(GEAR_PROPERTY,old);}catch{}throw error;}}
