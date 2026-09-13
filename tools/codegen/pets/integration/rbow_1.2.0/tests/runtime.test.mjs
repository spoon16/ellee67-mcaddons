/** These exercise the actual runtime entry point against a minimal API double.
 * They do NOT run Minecraft or establish game-engine event ordering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const mainText=fs.readFileSync(new URL('../behavior_pack/scripts/main.js',import.meta.url),'utf8');
const rulesText=fs.readFileSync(new URL('../behavior_pack/scripts/rules.js',import.meta.url),'utf8');

async function load() {
 const handlers={}, deferred=[],warnings=[],registered={};
 const group=prefix=>new Proxy({}, {get:(_,n)=>({subscribe:fn=>{handlers[prefix+'.'+String(n)]=fn;}})});
 const world={beforeEvents:group('before'),afterEvents:group('after'),gameRules:{doTileDrops:true}};
 const system={beforeEvents:group('system.before'),afterEvents:group('system.after'),run:fn=>deferred.push(fn)};
 class ItemStack {constructor(typeId,amount=1){this.typeId=typeId;this.amount=amount;}getComponent(){return undefined;}}
 function permutation(type,states={}){return {type:{id:type},getAllStates:()=>({...states}),getState:k=>states[k],matches:(id,st)=>type===id&&Object.entries(st).every(([k,v])=>states[k]===v),withState:(k,v)=>permutation(type,{...states,[k]:v})};}
 const api={world,system,ItemStack,EquipmentSlot:{Mainhand:'Mainhand'},GameMode:{Survival:'survival',Creative:'creative',Adventure:'adventure',Spectator:'spectator'},BlockPermutation:{resolve:(id)=>permutation(id,id.includes('log')?{pillar_axis:'y'}:{})}};
 const context=vm.createContext({console:{warn:msg=>warnings.push(msg)},Math,Set,Object,String,Number});
 const mock=new vm.SyntheticModule(Object.keys(api),function(){for(const [k,v] of Object.entries(api))this.setExport(k,v);},{context});
 const rules=new vm.SourceTextModule(rulesText,{context});await rules.link(()=>{});await rules.evaluate();
 const main=new vm.SourceTextModule(mainText,{context});await main.link(spec=>spec==='@minecraft/server'?mock:rules);await main.evaluate();
 handlers['system.before.startup']({itemComponentRegistry:{registerCustomComponent:(id,obj)=>{registered[id]=obj;}}});
 return {handlers,deferred,warnings,registered,api,permutation,flush(){while(deferred.length)deferred.shift()();}};
}
function equipment(typeId, damage=0,maxDurability=2032) {
 const dur={damage,maxDurability,unbreakable:false};
 let held={typeId,getComponent:n=>n==='minecraft:durability'?dur:n==='minecraft:enchantable'?{getEnchantment:()=>undefined}:undefined};
 return {getEquipment:()=>held,setEquipment:(_slot,item)=>{held=item;},dur,setHeld:x=>{held=x;}};
}
function player(eq) {
 const sounds=[], drops=[];
 const p={typeId:'minecraft:player',id:'p',isValid:true,selectedSlotIndex:0,getGameMode:()=> 'survival',getComponent:n=>n==='minecraft:equippable'?eq:undefined,location:{x:0,y:1,z:0},dimension:{playSound:(...v)=>sounds.push(v),spawnItem:(...v)=>drops.push(v)}};
 return {p,sounds,drops};
}
test('actual entry point subscribes and registers its component without querying world state',async()=>{
 const x=await load();assert.deepEqual(Object.keys(x.registered),['elleedog:rbow_tool']);assert.equal(x.warnings.length,0);
 for(const event of ['after.playerBreakBlock','before.playerInteractWithBlock'])assert.equal(typeof x.handlers[event],'function');
});
test('native explosions and dropped item damage have no script interception',async()=>{
 const x=await load();
 for(const event of ['before.explosion','before.entityHurt','after.entityHurt','after.entitySpawn'])assert.equal(x.handlers[event],undefined);
});
test('mining uses the pre-break item and honors game rule',async()=>{
 const x=await load(),drops=[];
 const e={brokenBlockPermutation:{type:{id:'elleedog:rbow_ore'}},itemStackBeforeBreak:{typeId:'minecraft:iron_pickaxe'},itemStackAfterBreak:undefined,player:{getGameMode:()=> 'survival'},block:{location:{x:10,y:-50,z:5}},dimension:{spawnItem:(...a)=>drops.push(a)}};
 x.handlers['after.playerBreakBlock'](e);assert.equal(drops[0][0].typeId,'elleedog:raw_rbow_ore');assert.equal(drops[0][0].amount,1);
 x.api.world.gameRules.doTileDrops=false;x.handlers['after.playerBreakBlock'](e);assert.equal(drops.length,1);
});
test('tool mining wear mutates the correct held stack and breaks at the configured maximum',async()=>{
 const x=await load(),eq=equipment('elleedog:rbow_pickaxe',2031),{p,sounds}=player(eq);
 x.registered['elleedog:rbow_tool'].onMineBlock({source:p,itemStack:eq.getEquipment()});
 assert.equal(eq.getEquipment(),undefined);assert.equal(sounds[0][0],'random.break');
});
test('creative, unbreakable, nonplayer and changed-tool mining events do not consume gear',async()=>{
 const x=await load();
 for(const mode of ['creative','unbreakable','nonplayer','changed']) {
 const eq=equipment('elleedog:rbow_pickaxe'),{p}=player(eq),snapshot=eq.getEquipment();
 if(mode==='creative')p.getGameMode=()=> 'creative';if(mode==='unbreakable')eq.dur.unbreakable=true;
 if(mode==='nonplayer')p.typeId='minecraft:zombie';if(mode==='changed')eq.setHeld({typeId:'minecraft:stick'});
 x.registered['elleedog:rbow_tool'].onMineBlock({source:p,itemStack:snapshot});assert.equal(eq.dur.damage,0);
 }
});
test('combat durability hook requests one for sword/hoe, two for other ordinary tools',async()=>{
 const x=await load();for(const [kind,n] of [['sword',1],['hoe',1],['axe',2],['pickaxe',2],['shovel',2]]){
 const e={itemStack:{typeId:'elleedog:rbow_'+kind},durabilityDamage:0};x.registered['elleedog:rbow_tool'].onBeforeDurabilityDamage(e);assert.equal(e.durabilityDamage,n);
 }
});
function interactionFixture(x) {
 const eq=equipment('elleedog:rbow_hoe'),{p,sounds}=player(eq);let target;
 const dim={getBlock:()=>target,playSound:(...v)=>sounds.push(v),spawnItem:()=>{}};
 target={typeId:'minecraft:dirt',dimension:dim,location:{x:1,y:2,z:3},permutation:x.permutation('minecraft:dirt'),above:()=>({isAir:true}),setPermutation:v=>{target.permutation=v;target.typeId=v.type.id;}};
 const e={player:p,itemStack:eq.getEquipment(),block:target,blockFace:'Up',cancel:false};
 return {p,eq,target,e,sounds};
}
test('hoe cancels native interaction and performs exactly one validated delayed edit',async()=>{
 const x=await load(),f=interactionFixture(x);x.handlers['before.playerInteractWithBlock'](f.e);x.handlers['before.playerInteractWithBlock'](f.e);
 assert.equal(f.e.cancel,true);assert.equal(x.deferred.length,1);assert.equal(f.target.typeId,'minecraft:dirt');x.flush();
 assert.equal(f.target.typeId,'minecraft:farmland');assert.equal(f.eq.dur.damage,1);
});
for(const change of ['slot','item','block','mode','space','valid'])test(`delayed interaction refuses stale ${change}`,async()=>{
 const x=await load(),f=interactionFixture(x);x.handlers['before.playerInteractWithBlock'](f.e);
 if(change==='slot')f.p.selectedSlotIndex=1;
 if(change==='item')f.eq.setHeld({typeId:'minecraft:stick'});
 if(change==='block')f.target.permutation=x.permutation('minecraft:diamond_block');
 if(change==='mode')f.p.getGameMode=()=> 'creative';
 if(change==='space')f.target.above=()=>({isAir:false});
 if(change==='valid')f.p.isValid=false;
 x.flush();assert.equal(f.eq.dur.damage,0);assert.notEqual(f.target.permutation.type.id,'minecraft:farmland');
});
test('runtime errors are logged once, not silently swallowed or repeated indefinitely',async()=>{
 const x=await load();const e={get brokenBlockPermutation(){throw Error('simulated failure');}};
 x.handlers['after.playerBreakBlock'](e);x.handlers['after.playerBreakBlock'](e);assert.equal(x.warnings.length,1);assert.match(x.warnings[0],/simulated failure/);
});
