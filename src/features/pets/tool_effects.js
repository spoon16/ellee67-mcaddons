/** Read-only visual metadata. Native item stacks are never replaced or edited.
 * Selection/visibility uses live client item queries; only glint is synchronized.
 */
import {EquipmentSlot} from '@minecraft/server';
import {HANDHELD_INDEX,SIDE_CARRY_INDEX,MODEL_BY_WIRE} from './catalog.generated.js';
import {isPlayer,FORM_PROPERTY} from './core.js';
function enchanted(item) {
  return !!item && (item.typeId === 'minecraft:enchanted_book' ||
    (item.getComponent('minecraft:enchantable')?.getEnchantments() ?? []).length > 0);
}
export function toolGlintState(item) {
  const index=item ? HANDHELD_INDEX[item.typeId] ?? 0 : 0;
  return {index,enchanted:index>0 && enchanted(item)};
}
export function carryState(item) {
  const index=item ? SIDE_CARRY_INDEX[item.typeId] ?? 0 : 0;
  return {index,enchanted:index>0 && enchanted(item),shieldEnchanted:item?.typeId==='minecraft:shield' && enchanted(item)};
}
export function classifyHand(item,hand='main') {
  if(!item)return 'empty';
  if(item.typeId==='minecraft:shield')return 'shield';
  if(hand==='main' && HANDHELD_INDEX[item.typeId])return 'mouth';
  if(SIDE_CARRY_INDEX[item.typeId])return 'side';
  return 'native-unmapped';
}
export function gearRoute(player) {
  const eq=player.getComponent('minecraft:equippable');
  const main=classifyHand(eq?.getEquipment(EquipmentSlot.Mainhand));
  const off=classifyHand(eq?.getEquipment(EquipmentSlot.Offhand),'off');
  const enabled=!!MODEL_BY_WIRE[player.getProperty(FORM_PROPERTY)] && player.getProperty('pet:gear_fit')!==false;
  return {main,off,thirdPersonReplacement:enabled && main!=='native-unmapped' && off!=='native-unmapped',
    note:'Expected third-person routing; the server cannot observe client rendering.'};
}
function setIfChanged(player,key,value) {
  if(player.getProperty(key)!==value)player.setProperty(key,value);
}
export function refreshToolGlint(player) {
  if(!isPlayer(player)||!MODEL_BY_WIRE[player.getProperty(FORM_PROPERTY)])return false;
  const eq=player.getComponent('minecraft:equippable');
  const main=eq?.getEquipment(EquipmentSlot.Mainhand),off=eq?.getEquipment(EquipmentSlot.Offhand);
  const tool=toolGlintState(main);
  setIfChanged(player,'pet:tool_enchanted_for',tool.index);
  setIfChanged(player,'pet:tool_enchanted',tool.enchanted);
  for(const [hand,item] of [['main',main],['off',off]]) {
    const state=carryState(item);
    setIfChanged(player,`pet:carry_${hand}_enchanted_for`,state.index);
    setIfChanged(player,`pet:carry_${hand}_enchanted`,state.enchanted);
    setIfChanged(player,`pet:${hand}_shield_enchanted`,!!state.shieldEnchanted);
  }
  return true;
}
