/** Upgrade transaction unit tests. Opaque fields model retained stack data;
 * these do not assert that Minecraft serializes a specific component correctly. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {LEGACY_TYPE,releaseLegacyDrop} from '../behavior_pack/scripts/legacy_drop_logic.js';
class Stack {
 constructor(typeId='elleedog:rbow_sword',amount=1,metadata={}) {this.typeId=typeId;this.amount=amount;this.metadata=structuredClone(metadata);}
 clone(){return new Stack(this.typeId,this.amount,this.metadata);}
}
function fixture(stack=new Stack(),fail={}) {
 let stored=stack?.clone(),gone=false;
 const calls=[],spawned=[],properties={};
 const entity={typeId:LEGACY_TYPE,id:'legacy',isValid:true,location:{x:2,y:64,z:3},
  getDynamicProperty:k=>properties[k],setDynamicProperty:(k,v)=>{properties[k]=v;},
  getComponent(k){assert.equal(k,'minecraft:inventory');return fail.inventory?undefined:{container:{
   getItem(slot){assert.equal(slot,0);return stored?.clone();},
   setItem(slot,item){assert.equal(slot,0);calls.push('clear');if(fail.clear)throw Error('clear failed');stored=item?.clone();}
  }};},
  remove(){calls.push('remove legacy');if(fail.remove)throw Error('remove legacy failed');gone=true;},
  dimension:{spawnItem(item,location){
   calls.push('spawn native');if(fail.spawn)throw Error('spawn failed');
   const drop={typeId:'minecraft:item',item:item.clone(),location:{...location},gone:false,
    remove(){calls.push('rollback native');if(fail.rollback)throw Error('rollback failed');this.gone=true;}};
   spawned.push(drop);return drop;
  }}
 };
 return {entity,calls,spawned,properties,stored:()=>stored,gone:()=>gone};
}
test('does not inspect, mutate or rewrap ordinary dropped items',()=>{
 const e={typeId:'minecraft:item',getComponent(){assert.fail('ordinary item untouched');}};
 assert.deepEqual(releaseLegacyDrop(e),{status:'ignored'});
});
test('moves the full stack to a native drop before removing empty carrier',()=>{
 const f=fixture(new Stack('elleedog:rbow_ingot',43));
 assert.deepEqual(releaseLegacyDrop(f.entity),{status:'released',typeId:'elleedog:rbow_ingot',amount:43});
 assert.deepEqual(f.calls,['spawn native','clear','remove legacy']);assert.equal(f.stored(),undefined);assert.ok(f.gone());
 assert.equal(f.spawned[0].typeId,'minecraft:item');assert.equal(f.spawned[0].item.amount,43);
 assert.deepEqual(f.spawned[0].location,{x:2,y:64,z:3});
});
test('preserves arbitrary cloneable item metadata, including native trim payload',()=>{
 const metadata={name:'Favorite helmet',damage:129,enchantments:['mending','protection:4'],lore:['original'],nativeTrim:{pattern:'coast',material:'gold'},dynamic:{'other:field':true}};
 const f=fixture(new Stack('elleedog:rbow_helmet',1,metadata));releaseLegacyDrop(f.entity);
 assert.deepEqual(f.spawned[0].item.metadata,metadata);assert.equal(f.spawned[0].item.typeId,'elleedog:rbow_helmet');
});
test('stack clone is independent of the original object',()=>{
 const s=new Stack('elleedog:rbow_sword',1,{name:'Original'}),f=fixture(s);releaseLegacyDrop(f.entity);
 s.metadata.name='Changed outside';assert.equal(f.spawned[0].item.metadata.name,'Original');
});
test('failed native spawn leaves stored stack intact and does not remove carrier',()=>{
 const f=fixture(new Stack(),{spawn:true});assert.throws(()=>releaseLegacyDrop(f.entity),/spawn failed/);
 assert.ok(f.stored());assert.equal(f.gone(),false);assert.equal(f.spawned.length,0);
});
test('failed source clear removes spawned copy and retains original',()=>{
 const f=fixture(new Stack(),{clear:true});assert.throws(()=>releaseLegacyDrop(f.entity),/clear failed/);
 assert.ok(f.stored());assert.equal(f.gone(),false);assert.equal(f.spawned[0].gone,true);
 assert.deepEqual(f.calls,['spawn native','clear','rollback native']);
});
test('double write/rollback failure is blocked from making repeated copies',()=>{
 const f=fixture(new Stack(),{clear:true,rollback:true});
 assert.throws(()=>releaseLegacyDrop(f.entity),e=>e.retryable===false);
 assert.deepEqual(releaseLegacyDrop(f.entity),{status:'blocked'});assert.equal(f.spawned.length,1);assert.ok(f.stored());
});
test('failed legacy removal after transfer leaves empty shell and no stored duplicate',()=>{
 const f=fixture(new Stack(),{remove:true});assert.equal(releaseLegacyDrop(f.entity).status,'released');
 assert.equal(f.stored(),undefined);assert.equal(f.spawned.length,1);assert.equal(f.spawned[0].gone,false);
 assert.throws(()=>releaseLegacyDrop(f.entity),/remove legacy failed/);assert.equal(f.spawned.length,1);
});
test('empty old carrier is removed without spawning an item',()=>{
 const f=fixture();f.entity.getComponent=()=>({container:{getItem:()=>undefined}});
 assert.deepEqual(releaseLegacyDrop(f.entity),{status:'empty'});assert.ok(f.gone());assert.equal(f.spawned.length,0);
});
test('missing inventory is reported without destroying carrier',()=>{
 const f=fixture(new Stack(),{inventory:true});assert.throws(()=>releaseLegacyDrop(f.entity),/inventory unavailable/);
 assert.equal(f.spawned.length,0);assert.equal(f.gone(),false);assert.ok(f.stored());
});
test('repeated callbacks after successful transfer cannot duplicate the stored stack',()=>{
 const f=fixture(new Stack('elleedog:rbow_block',64));releaseLegacyDrop(f.entity);releaseLegacyDrop(f.entity);
 assert.equal(f.spawned.length,1);assert.equal(f.spawned[0].item.amount,64);
});
