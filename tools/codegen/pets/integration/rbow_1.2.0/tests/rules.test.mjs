import test from 'node:test';
import assert from 'node:assert/strict';
import {NS,ITEMS,BLOCKS,GEAR,canHarvest,miningDrop,fortuneCount,durabilityLoss,toolAction} from '../behavior_pack/scripts/rules.js';

function item(typeId, levels={}, tags=[]) {
  return {typeId, hasTag: t=>tags.includes(t), getComponent: n=>n==='minecraft:enchantable'?{getEnchantment: n=>levels[n]?{level:levels[n]}:undefined}:undefined};
}
const pick=item(NS+'rbow_pickaxe');
test('runtime allowlists contain exactly the registered material set',()=>{
 assert.equal(ITEMS.size,16);assert.equal(BLOCKS.size,3);assert.equal(GEAR.size,10);
 assert.ok([...ITEMS].every(x=>x.startsWith(NS)&&!x.includes('rboe')&&!x.includes('rainbow')));
});
for(const type of ['iron','diamond','netherite']) test(`${type} pickaxe can harvest`,()=>assert.equal(canHarvest(item('minecraft:'+type+'_pickaxe')),true));
for(const type of ['wooden','stone','golden','copper']) test(`${type} pickaxe cannot harvest`,()=>assert.equal(canHarvest(item('minecraft:'+type+'_pickaxe')),false));
test('Rbow pickaxe and properly tier-tagged third-party pickaxes harvest',()=>{
 assert.equal(canHarvest(pick),true);
 assert.equal(canHarvest(item('other:pick',{},['minecraft:is_pickaxe','minecraft:iron_tier'])),true);
 assert.equal(canHarvest(item('other:pick',{},['minecraft:is_pickaxe'])),false);
 assert.equal(canHarvest(item('other:sword',{},['minecraft:netherite_tier'])),false);
 assert.equal(canHarvest(undefined),false);
});
for(const ore of ['rbow_ore','deepslate_rbow_ore']) {
 test(`${ore} ordinary drop is one raw ore`,()=>assert.deepEqual(miningDrop(NS+ore,pick,'Survival',true,()=>.2),{typeId:NS+'raw_rbow_ore',amount:1}));
 test(`${ore} Silk Touch takes precedence over Fortune`,()=>assert.deepEqual(miningDrop(NS+ore,item(pick.typeId,{silk_touch:1,fortune:3}),'Survival',true,()=>.99),{typeId:NS+ore,amount:1}));
 test(`${ore} Fortune III can give four raw`,()=>assert.equal(miningDrop(NS+ore,item(pick.typeId,{fortune:3}),'Survival',true,()=>.99).amount,4));
}
test('storage block drops itself rather than multiplied ingots',()=>assert.deepEqual(miningDrop(NS+'rbow_block',item(pick.typeId,{fortune:3}),'Survival'),{typeId:NS+'rbow_block',amount:1}));
test('Creative, Spectator, wrong tool, unrelated block and disabled drops produce nothing',()=>{
 for(const m of ['Creative','Spectator','creative']) assert.equal(miningDrop(NS+'rbow_ore',pick,m),undefined);
 assert.equal(miningDrop(NS+'rbow_ore',pick,'Survival',false),undefined);
 assert.equal(miningDrop(NS+'rbow_ore',item('minecraft:wooden_pickaxe'),'Survival'),undefined);
 assert.equal(miningDrop('minecraft:diamond_ore',pick,'Survival'),undefined);
});
test('survival casing and authorized Adventure block breaks preserve drops',()=>{
 for(const mode of ['survival','Survival','Adventure','adventure']) assert.equal(miningDrop(NS+'rbow_ore',pick,mode).amount,1);
});
test('Fortune zero always one; Fortune three has expected 2:1:1:1 bucket weights',()=>{
 for(let i=0;i<100;i++) assert.equal(fortuneCount(0,()=>i/100),1);
 assert.deepEqual([.1,.3,.5,.7,.9].map(x=>fortuneCount(3,()=>x)),[1,1,2,3,4]);
});
test('Fortune and tool-wear random boundaries are clamped',()=>{
 assert.equal(fortuneCount(3,()=>1),4);assert.equal(fortuneCount(-10,()=>.9),1);
 assert.equal(fortuneCount(999,()=>1),256);
 assert.equal(durabilityLoss(2,0,()=>.99),2);
 assert.equal(durabilityLoss(2,3,()=>.9),0);
 assert.equal(durabilityLoss(2,3,()=>.1),2);
});
for(const block of ['dirt','grass_block','grass_path']) test(`hoe tills ${block}`,()=>assert.equal(toolAction(NS+'rbow_hoe','minecraft:'+block,true,'Up').block,'minecraft:farmland'));
test('hoe converts coarse and rooted dirt in stages',()=>{
 assert.equal(toolAction(NS+'rbow_hoe','minecraft:coarse_dirt',true,'Up').block,'minecraft:dirt');
 assert.equal(toolAction(NS+'rbow_hoe','minecraft:dirt_with_roots',true,'Up').extra,'minecraft:hanging_roots');
});
test('soil actions require clear space above and no underside click',()=>{
 for(const t of ['hoe','shovel']) {
 assert.equal(toolAction(NS+'rbow_'+t,'minecraft:dirt',false,'Up'),undefined);
 assert.equal(toolAction(NS+'rbow_'+t,'minecraft:dirt',true,'down'),undefined);
 }
});
test('shovel paths soil and extinguishes both campfire types',()=>{
 assert.equal(toolAction(NS+'rbow_shovel','minecraft:podzol',true,'Up').block,'minecraft:grass_path');
 for(const fire of ['campfire','soul_campfire']) assert.deepEqual(toolAction(NS+'rbow_shovel','minecraft:'+fire,false,'Down'),{state:'extinguished',value:true,sound:'random.fizz'});
});
test('axe preserves state semantics while stripping recognized log families',()=>{
 for(const type of ['oak_log','spruce_wood','crimson_stem','warped_hyphae','bamboo_block','pale_oak_log']) {
 const a=toolAction(NS+'rbow_axe','minecraft:'+type,false,'North');
 assert.equal(a.block,'minecraft:stripped_'+type);assert.equal(a.keepStates,true);
 }
});
test('tool actions never rewrite already stripped blocks or another add-on blocks',()=>{
 for(const type of ['minecraft:stripped_oak_log','minecraft:stone','other:oak_log']) assert.equal(toolAction(NS+'rbow_axe',type,true,'Up'),undefined);
 assert.equal(toolAction('minecraft:diamond_hoe','minecraft:dirt',true,'Up'),undefined);
});
