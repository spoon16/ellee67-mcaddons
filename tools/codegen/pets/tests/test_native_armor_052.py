"""Native armor regression tests. No Minecraft client is emulated by these tests."""
from pathlib import Path
from copy import deepcopy
from tempfile import TemporaryDirectory
from unittest import TestCase
from itertools import product
import json,sys,shutil
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,write,load_catalog
from render_isolation import validate,pet_world_bones
from molang_subset import Expression
from native_armor_reference import assert_unchanged_content
RP=ROOT/'resource_pack';_,PETS,_=load_catalog(ROOT)
class NativeArmor052(TestCase):
 def test_isolation_validator_passes_packaged_configuration(self):
  result=validate(ROOT,RP,PETS);self.assertEqual(result['status'],'PASS');self.assertEqual(result['armor_adapters'],28);self.assertFalse(result['minecraft_tested'])
 def fixture(self):
  t=TemporaryDirectory();self.addCleanup(t.cleanup);rp=Path(t.name)/'rp';shutil.copytree(RP,rp);return rp
 def test_rejects_old_geometry_switch_controller(self):
  rp=self.fixture();p=rp/'render_controllers/pet_armor.render_controllers.json';d=read(p)
  d['render_controllers']['controller.render.pet.armor_native']['geometry']='Array.pet_armor[variable.pet_fit_index]';write(p,d)
  with self.assertRaisesRegex(ValueError,'Native armor'):validate(ROOT,rp,PETS)
 def test_rejects_forcing_rebuild_on_humanoid_armor(self):
  rp=self.fixture();p=rp/'render_controllers/pet_armor.render_controllers.json';d=read(p);d['render_controllers']['controller.render.pet.armor_native']['rebuild_animation_matrices']=True;write(p,d)
  with self.assertRaisesRegex(ValueError,'Native armor'):validate(ROOT,rp,PETS)
 def test_rejects_root_in_an_equipment_mesh(self):
  rp=self.fixture();p=rp/'models/entity/pets/carter/armor_chestplate.geo.json';d=read(p);d['minecraft:geometry'][0]['bones'].insert(0,{'name':'root','pivot':[0,0,0]});write(p,d)
  with self.assertRaisesRegex(ValueError,'Native bone'):validate(ROOT,rp,PETS)
 def test_rejects_human_body_rotation_in_pet_clip(self):
  rp=self.fixture();p=rp/'animations/pets/mochi.animation.json';d=read(p);d['animations']['animation.pet.mochi.ride']['bones']['body']={'rotation':[52,0,0]};write(p,d)
  with self.assertRaisesRegex(ValueError,'humanoid bones'):validate(ROOT,rp,PETS)
 def test_rejects_disabling_native_offsets_while_morphed(self):
  rp=self.fixture();p=rp/'attachables/rbow_chestplate.player.json';d=read(p);d['minecraft:attachable']['description']['scripts']['animate']=[{'offset':'variable.pet_fit_index == 0'}];write(p,d)
  with self.assertRaisesRegex(ValueError,'offset'):validate(ROOT,rp,PETS)
 def test_pet_root_cannot_be_parented_to_native_body(self):
  with self.assertRaisesRegex(ValueError,'depends on native'):
   pet_world_bones([{'name':'pet_root','parent':'body','pivot':[0,0,0]},{'name':'body','pivot':[0,24,0]}])
 def test_only_current_wearer_armor_is_visible_across_all_transitions(self):
  controllers=read(RP/'render_controllers/pet_armor.render_controllers.json')['render_controllers']
  exprs=[Expression(c['part_visibility'][0]['*']) for c in controllers.values()]
  d=read(RP/'attachables/rbow_chestplate.player.json')['minecraft:attachable']['description']
  choose=Expression(d['scripts']['pre_animation'][0].split('=',1)[1].rstrip(';').replace('context.owning_entity->','owner.'))
  for before,after,fit,first in product(range(4),range(4),[False,True],[False,True]):
   def env(model):
    props={'pet:model_id':model,'pet:armor_fit':fit}
    return {'query.owner_identifier':'minecraft:player','context.is_first_person':first,'owner.query.has_property':lambda k:k in props,'owner.query.property':lambda k:props[k]}
   choose(env(before));index=choose(env(after));drawn=[bool(f({'variable.pet_fit_index':index})) for f in exprs]
   expected=after if fit and not first else 0
   self.assertEqual(drawn,[i==expected for i in range(4)])
 def test_invisible_pet_armor_keeps_immutable_geometry(self):
  cs=read(RP/'render_controllers/pet_armor.render_controllers.json')['render_controllers']
  for name,c in cs.items():
   self.assertTrue(c['geometry'].startswith('Geometry.'));self.assertNotIn('arrays',c);self.assertNotIn('variable',c['geometry'])
 def test_native_player_render_parameters_match_official_source(self):
  now=read(RP/'render_controllers/player.render_controllers.json')['render_controllers']['controller.render.player.third_person'];old=read(ROOT/'upstream/native_armor_052/player.third_person.render_controller.json')
  self.assertEqual({k:v for k,v in now.items() if k!='part_visibility'},{k:v for k,v in old.items() if k!='part_visibility'})
  for oldrule,newrule in zip(old['part_visibility'],now['part_visibility']):
   key=next(iter(oldrule));f=Expression(newrule[key]);v=oldrule[key]
   for flag in [0,1]:
    env={'variable.pet_tp':False,'variable.helmet_layer_visible':flag,'variable.leg_layer_visible':flag,'variable.boot_layer_visible':flag,'variable.chest_layer_visible':flag,'query.has_cape':flag}
    original=bool(v) if isinstance(v,bool) else bool(Expression(v)(env));self.assertEqual(bool(f(env)),original)
    env['variable.pet_tp']=True;self.assertFalse(f(env))
 def test_approved_art_rbow_gameplay_and_pet_channels_are_preserved(self):assert_unchanged_content(self)
 def test_released_shader_inputs_stay_item_owned(self):
  cs=read(RP/'render_controllers/pet_armor.render_controllers.json')['render_controllers']
  for c in cs.values():
   self.assertEqual(c['textures'],['variable.has_trim ? variable.trim_path : Texture.default','Texture.enchanted'])
   self.assertEqual(c['materials'],[{'*':'variable.is_enchanted ? Material.enchanted : Material.default'}])
