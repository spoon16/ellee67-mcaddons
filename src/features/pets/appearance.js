/** Coordinated form transitions. Presentation only: no inventory, armor-stack or camera writes.
 * Minecraft defers setProperty. Compute the entire target from the requested form,
 * not from same-tick getProperty(model_id), and queue it in one writable callback.
 */
import {system} from '@minecraft/server';
import {requireProperties} from './property_health.js';
import {initialSeatProperties} from './seating.js';
import {FORM_PROPERTY, PREFERENCE, preferredForm, validateForm, isPlayer, wireId, MAX_WIRE_ID} from './core.js';
import {MODEL_BY_ID, DEFAULT_HAND_HEIGHT} from './catalog.generated.js';
import {
  VIEW_PROPERTY, VIEW_PREFERENCE, MOTION_PROPERTY, MOTION_PREFERENCE,
  ARMOR_PROPERTY, ARMOR_PREFERENCE, GEAR_PROPERTY, GEAR_PREFERENCE,
  HAND_HEIGHT_PROPERTY, HAND_HEIGHT_PREFERENCE,
  preferredView, preferredMotion, preferredArmor, preferredGear
} from './settings.js';

const RESETTABLE=[VIEW_PREFERENCE,MOTION_PREFERENCE,ARMOR_PREFERENCE,GEAR_PREFERENCE];
const pending=new WeakMap();
export function normalizeForm(form) { return validateForm(form==='player' ? 'human' : form); }
export function publicForm(form) { return form==='human' ? 'player' : form; }

export function appearanceFor(player, form, defaults=false) {
  form=normalizeForm(form);
  const pet=form!=='human';
  const calibrated=player.getDynamicProperty(HAND_HEIGHT_PREFERENCE);
  const height=Number.isInteger(calibrated)&&calibrated>=-8&&calibrated<=12
    ? calibrated : MODEL_BY_ID[form]?.first_person.default_hand_height ?? DEFAULT_HAND_HEIGHT;
  const target={
    [FORM_PROPERTY]:wireId(form),
    [VIEW_PROPERTY]:pet ? (defaults?'paws':preferredView(player)) : 'native',
    [MOTION_PROPERTY]:pet && (defaults || preferredMotion(player)),
    [ARMOR_PROPERTY]:pet && (defaults || preferredArmor(player)),
    [GEAR_PROPERTY]:pet && (defaults || preferredGear(player)),
    [HAND_HEIGHT_PROPERTY]:pet ? height : 0,
    'pet:tool_enchanted':false, 'pet:tool_enchanted_for':0,
    'pet:seat_lift':0, 'pet:seat_kind':0
  };
  for(const hand of ['main','off']) {
    target[`pet:carry_${hand}_enchanted`]=false;
    target[`pet:carry_${hand}_enchanted_for`]=0;
    target[`pet:${hand}_shield_enchanted`]=false;
  }
  if(pet)Object.assign(target,initialSeatProperties(player));
  return target;
}

/** Explicit selection resets diagnostic overrides; lifecycle restore preserves them.
 * Hand calibration and unrelated add-on settings are never cleared.
 * Rollback is best effort on engine errors; not a claim of a network transaction.
 */
export function transitionForm(player, form, {persist=true, defaults=true}={}) {
  if(!isPlayer(player)) throw new Error('The player is no longer connected.');
  form=normalizeForm(form);
  const desired=appearanceFor(player,form,defaults);
  const current=requireProperties(player,Object.keys(desired));
  if(!Number.isInteger(current[FORM_PROPERTY])||current[FORM_PROPERTY]<0||current[FORM_PROPERTY]>MAX_WIRE_ID)
    throw new Error('Invalid pet:model_id; check matching packs.');
  const previousPending=pending.get(player);
  const before=previousPending?.tick===system.currentTick ? {...current,...previousPending.target}:current;
  const changedPrefs=persist ? [PREFERENCE,...(defaults?RESETTABLE:[])] : [];
  const oldPrefs=Object.fromEntries(changedPrefs.map(k=>[k,player.getDynamicProperty(k)]));
  try {
    // Queue dependent state before the model selection; all target the same entity tick.
    for(const [key,value] of Object.entries(desired)) if(key!==FORM_PROPERTY) player.setProperty(key,value);
    player.setProperty(FORM_PROPERTY,desired[FORM_PROPERTY]);
    if(persist) {
      if(defaults) for(const key of RESETTABLE) player.setDynamicProperty(key,undefined);
      player.setDynamicProperty(PREFERENCE,form);
    }
    pending.set(player,{tick:system.currentTick,target:desired});
  } catch(error) {
    for(const [key,value] of Object.entries(before)) { try {player.setProperty(key,value);} catch {} }
    for(const [key,value] of Object.entries(oldPrefs)) { try {player.setDynamicProperty(key,value);} catch {} }
    throw error;
  }
  return {form,properties:desired};
}
export function restoreAppearance(player,persistMigration=false) {
  return transitionForm(player,preferredForm(player),{persist:persistMigration,defaults:false});
}
export function forgetAppearance(player) { pending.delete(player); }
