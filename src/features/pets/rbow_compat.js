/** Explicit, read-only integration diagnostics; no startup announcements. */
import {EquipmentSlot, ItemStack} from '@minecraft/server';
import {inspectProperties,observeProperty} from './property_health.js';
import {gearRoute} from './tool_effects.js';
export const RBOW_COUNT='elleedog:rbow_armor_count';
export const RBOW_GEAR=Object.freeze(['helmet','chestplate','leggings','boots','sword','pickaxe','axe','shovel','hoe','spear'].map(s=>'elleedog:rbow_'+s));
export function rbowReport(player) {
  const pets=inspectProperties(player),count=observeProperty(player,RBOW_COUNT);
  const validCount=count.status==='ok'&&Number.isInteger(count.value)&&count.value>=0&&count.value<=4;
  const registrations=Object.fromEntries(RBOW_GEAR.map(id=>{
    try{return [id,new ItemStack(id,1).typeId===id];}catch{return [id,false];}
  }));
  const equippable=player.getComponent('minecraft:equippable');
  const armor=Object.fromEntries([['head',EquipmentSlot.Head],['chest',EquipmentSlot.Chest],['legs',EquipmentSlot.Legs],['feet',EquipmentSlot.Feet]].map(([label,slot])=>[label,equippable?.getEquipment(slot)?.typeId??null]));
  const ready=pets.status==='READY'&&validCount&&Object.values(registrations).every(Boolean);
  return {status:ready?'READY':'INCOMPLETE',petsVersion:'0.5.2',rbowCompanion:'1.2.3',rbowGameplayBase:'1.2.0',
    petProperties:`${pets.validCount}/${pets.expected}`,model:pets.model,form:pets.serverForm,
    rbowArmorCount:count,registeredItems:registrations,wornArmor:armor,gearRoute:gearRoute(player),
    note:'Server definitions and registrations only; not client render verification.'};
}
