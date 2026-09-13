/** Load the actual entire script graph; no Minecraft client/engine is simulated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../behavior_pack/scripts/',import.meta.url));
async function loadAll() {
  const handlers=new Map(),deferred=[],intervals=[],imports=new Set(),warnings=[];
  const events=prefix=>new Proxy({}, {get:(_,name)=>({subscribe(fn){
    const key=prefix+'.'+String(name);const existing=handlers.get(key)??[];existing.push(fn);handlers.set(key,existing);
  }})});
  const world={beforeEvents:events('before'),afterEvents:events('after'),gameRules:{doTileDrops:true}};
  const system={beforeEvents:events('system.before'),afterEvents:events('system.after'),
    run:fn=>deferred.push(fn),runInterval:(fn,n)=>intervals.push({fn,n})};
  class ItemStack {constructor(typeId,amount=1){this.typeId=typeId;this.amount=amount;}getComponent(){return undefined;}}
  const api={world,system,ItemStack,BlockPermutation:{},EquipmentSlot:{Mainhand:'Mainhand'},
    GameMode:{Survival:'survival',Creative:'creative',Adventure:'adventure',Spectator:'spectator'}};
  const context=vm.createContext({console:{warn:msg=>warnings.push(msg)}});
  const mock=new vm.SyntheticModule(Object.keys(api),function(){for(const [k,v] of Object.entries(api))this.setExport(k,v);},{context});
  const modules=new Map();
  function get(file) {
    if(!modules.has(file)) modules.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file}));
    return modules.get(file);
  }
  const entry=get(path.join(root,'bootstrap.js'));
  await entry.link((spec,from)=>{
    imports.add(spec);
    if(spec==='@minecraft/server')return mock;
    assert.ok(spec.startsWith('./'),`Unexpected external dependency: ${spec}`);
    const target=path.resolve(path.dirname(from.identifier),spec);assert.ok(target.startsWith(root));return get(target);
  });
  await entry.evaluate();
  return {handlers,deferred,intervals,imports,warnings,modules};
}
test('entire shipped script graph loads without server-ui or a trim module',async()=>{
 const x=await loadAll();assert.equal(x.warnings.length,0);
 assert.ok(![...x.imports].some(s=>s.includes('server-ui')||s.includes('trim_station')));
 assert.equal(x.modules.size,5);
 assert.equal(x.handlers.get('before.playerInteractWithBlock').length,1);
 assert.equal(x.intervals.length,0); // no drop scanning, collection or armor synchronization
 for(const event of ['before.explosion','before.entityHurt','after.entitySpawn'])assert.equal(x.handlers.get(event),undefined,event);
 for(const event of ['after.entityLoad','after.worldLoad'])assert.equal(x.handlers.get(event).length,1,event);
});
for(const crouching of [false,true]) for(const kind of ['rbow_ingot','rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots','rbow_hoe','rbow_axe','rbow_shovel','rbow_spear','rbow_sword']) {
 test(`smithing is not intercepted: ${kind}, crouch=${crouching}`,async()=>{
  const x=await loadAll();
  for(const mode of ['survival','creative']) {
   const item={typeId:'elleedog:'+kind,amount:1};
   const player={id:'p',isSneaking:crouching,getGameMode:()=>mode,getComponent(){throw Error('Smithing must not edit inventory.');}};
   const block={typeId:'minecraft:smithing_table',above:()=>({isAir:true}),permutation:{}};
   const event={itemStack:item,player,block,blockFace:'Up',cancel:false};
   for(const handler of x.handlers.get('before.playerInteractWithBlock'))handler(event);
   assert.equal(event.cancel,false);assert.equal(item.amount,1);assert.equal(x.deferred.length,0);assert.equal(x.warnings.length,0);
  }
 });
}
test('ordinary vanilla material and empty hand also retain native table interaction',async()=>{
 const x=await loadAll();
 for(const type of [undefined,'minecraft:gold_ingot','minecraft:diamond','minecraft:coast_armor_trim_smithing_template']) {
  const event={itemStack:type?{typeId:type}:undefined,player:{isSneaking:true},block:{typeId:'minecraft:smithing_table'},cancel:false};
  for(const h of x.handlers.get('before.playerInteractWithBlock'))h(event);
  assert.equal(event.cancel,false);
 }
 assert.equal(x.deferred.length,0);assert.equal(x.warnings.length,0);
});
test('does not undo a cancellation by another add-on',async()=>{
 const x=await loadAll();const e={itemStack:{typeId:'elleedog:rbow_ingot'},player:{isSneaking:true},block:{typeId:'minecraft:smithing_table'},cancel:true};
 for(const h of x.handlers.get('before.playerInteractWithBlock'))h(e);
 assert.equal(e.cancel,true);assert.equal(x.deferred.length,0);
});

test('native item loads do not queue conversions or alter their stacks',async()=>{
 const x=await loadAll();
 for(const typeId of ['minecraft:item','minecraft:player','minecraft:armor_stand']) {
  const event={entity:{typeId,id:typeId,getComponent(){assert.fail('must not read ordinary item stacks');}}};
  for(const h of x.handlers.get('after.entityLoad'))h(event);
 }
 assert.equal(x.deferred.length,0);assert.equal(x.warnings.length,0);assert.equal(x.intervals.length,0);
});
