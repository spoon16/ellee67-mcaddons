"""Focused 0.4.1 regressions; mathematical checks do NOT emulate Bedrock."""
from pathlib import Path
from copy import deepcopy
import sys,json,hashlib,unittest
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
import animation_sample as sample
from handhelds import pose
RP=ROOT/'resource_pack';_,PETS,_=load_catalog(ROOT)
D=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
def geom(p,name):return read(RP/f'models/entity/pets/{p}/{name}.geo.json')['minecraft:geometry'][0]
def animations(p):return {k.replace(f'animation.pet.{p}.','animation.pet.'):v for k,v in read(RP/f'animations/pets/{p}.animation.json')['animations'].items()}
def box_overlap(a,b):return all(max(a['origin'][i],b['origin'][i])<min(a['origin'][i]+a['size'][i],b['origin'][i]+b['size'][i])-1e-8 for i in range(3))
def item_env(item='',off=''):
 return {'query.is_item_name_any':lambda slot,*names:((off if slot=='slot.weapon.offhand' else item) if ':' in (off if slot=='slot.weapon.offhand' else item) else 'minecraft:'+(off if slot=='slot.weapon.offhand' else item)) in names}
def assign(name):return Expression(next(s for s in D['scripts']['pre_animation'] if s.startswith(name+' =')).split('=',1)[1].rstrip(';'))
class GearGeometry(unittest.TestCase):
 def test_all_pet_motion_channels_preserved_without_native_companions(self):
  from native_armor_reference import assert_unchanged_content
  assert_unchanged_content(self)
 def test_first_person_assets_and_common_clips_remain_unchanged(self):
  base=ROOT/'baseline/0.2.1'
  self.assertEqual((RP/'textures/entity/pets/carter/paws.png').read_bytes(),(base/'resource_pack/textures/entity/carter/first_person_paws.png').read_bytes())
  self.assertEqual(geom('carter','paws')['bones'],read(base/'resource_pack/models/entity/first_person_paws.geo.json')['minecraft:geometry'][0]['bones'])
 def test_carter_crown_is_above_all_head_fur(self):
  p=PETS[0];base=geom(p['id'],'model');head=next(b for b in base['bones'] if b['name']=='pet_head')
  top=max(c['origin'][1]+c['size'][1] for c in head['cubes'])
  crown=next(c for c in read(ROOT/p['equipment']['armor_fit'])['slots']['helmet'] if c['role']=='crown')
  self.assertGreater(crown['origin'][1],top);self.assertLess(crown['origin'][0],-4);self.assertGreater(crown['origin'][0]+crown['size'][0],4)
 def test_mochi_crown_does_not_intersect_upright_ears(self):
  g=geom('mochi','model');ears=[c for b in g['bones'] if b['name'] in ['pet_ear_left','pet_ear_right'] for c in b['cubes']]
  crown=read(ROOT/'assets/pets/mochi/armor_fit.json')['slots']['helmet']
  for a in crown:
   for b in ears:self.assertFalse(box_overlap(a,b))
 def test_back_plates_cover_the_torso_length_and_width(self):
  for p in PETS:
   body=next(b for b in geom(p['id'],'model')['bones'] if b['name']=='pet_body')['cubes'][0]
   back=next(v for v in read(ROOT/p['equipment']['armor_fit'])['slots']['chestplate'] if v['role']=='dorsal_plate')
   for i in [0,2]:self.assertLessEqual(back['origin'][i],body['origin'][i]);self.assertGreaterEqual(back['origin'][i]+back['size'][i],body['origin'][i]+body['size'][i])
   self.assertGreater(back['origin'][1],body['origin'][1]+body['size'][1])
 def test_iron_crowns_and_back_uvs_are_opaque(self):
  tex=np.array(Image.open(ROOT/'upstream/armor_textures/iron_1.png').convert('RGBA'))
  for p in PETS:
   for slot in ['helmet','chestplate']:
    g=geom(p['id'],'armor_'+slot)
    for bone in g['bones']:
     if not bone.get('cubes'):continue
     for c in bone['cubes']:
      # Every top surface uses explicitly occupied material islands, not neckline gaps.
      uv=c['uv']['up'];x,y=uv['uv'];w,h=uv['uv_size']
      crop=tex[int(y):int(np.ceil(y+h)),int(x):int(np.ceil(x+w)),3]
      if slot=='chestplate' and not bone['name'].endswith('_0'):continue
      self.assertTrue(np.all(crop>0),(p['id'],bone['name']))
 def test_legs_and_boots_geometry_inputs_unchanged(self):
  expected=read(ROOT/'tests/confirmed_030_asset_hashes.json')
  for p in PETS:
   parts=read(ROOT/p['equipment']['armor_fit'])['slots']
   for slot in ['boots','leggings']:self.assertEqual(hashlib.sha256(json.dumps(parts[slot],sort_keys=True).encode()).hexdigest(),expected[p.get('variant_of',p['id'])+'.'+slot])
 def test_confirmed_original_pet_and_paw_assets_are_byte_identical(self):
  for key,expected in read(ROOT/'tests/confirmed_030_asset_hashes.json').items():
   pet,file=key.split('.',1)
   if file in ['boots','leggings']:continue
   self.assertEqual(hashlib.sha256((ROOT/f'assets/pets/{pet}/{file}').read_bytes()).hexdigest(),expected)
 def test_tool_meshes_are_parented_to_head_not_leg(self):
  for p in PETS:
   for shape in ['pickaxe','sword','axe','shovel','hoe']:
    by={b['name']:b for b in geom(p['id'],'tool_'+shape)['bones']};self.assertEqual(by['pet_tool_pixels']['parent'],'pet_tool_mount');self.assertEqual(by['pet_tool_mount']['parent'],'pet_head')
 def test_pixel_mesh_preserves_alpha_texture_shape(self):
  for p in PETS:
   cubes=next(b for b in geom(p['id'],'tool_pickaxe')['bones'] if b['name']=='pet_tool_pixels')['cubes']
   self.assertEqual(len(cubes),256);self.assertEqual({tuple(c['uv']['north']['uv']) for c in cubes},{(x,y) for x in range(16) for y in range(16)})
 def test_tool_handle_diagonal_is_rotated_sideways(self):
  for p in PETS:
   rotated=sample.rotation([0,0,p['equipment']['mouth_sprite']['bake_pixel_rotation_z']])@np.array([1.,1.,0.,0.]);self.assertLess(abs(rotated[1]),1e-8);self.assertLess(abs(rotated[2]),1e-8);self.assertGreater(rotated[0],1)
 def test_nod_is_vertical_and_returns_to_neutral(self):
  for p in PETS:
   a=animations(p['id'])['animation.pet.attack']['bones']['pet_head'];f=Expression(a['rotation'][0]);self.assertEqual(a['rotation'][1:],[0,0]);self.assertAlmostEqual(f({'variable.attack_time':0}),0);self.assertAlmostEqual(f({'variable.attack_time':1}),0);self.assertLess(f({'variable.attack_time':.25}),-20);self.assertGreater(f({'variable.attack_time':.75}),20)
 def test_mouth_mesh_pivot_tracks_head_through_attack(self):
  for p in PETS:
   sample.ANIMS=animations(p['id']);g=geom(p['id'],'tool_pickaxe');m=np.array([*p['equipment']['mouth_sprite']['position'],1.])
   for t in [0,.125,.25,.5,.75,1]:
    u=sample.pose_updates('attack',t,attack=t,look_x=12,look_y=22);mats=sample.matrices(g['bones'],u)
    np.testing.assert_allclose(mats['pet_tool_mount']@m,mats['pet_head']@m,atol=1e-8)
 def test_shield_mount_follows_torso_not_head(self):
  for p in PETS:
   for side in ['left','right']:
    by={b['name']:b for b in geom(p['id'],'shield_'+side)['bones']};self.assertEqual(by['pet_shield_'+side]['parent'],'pet_body');self.assertEqual(by['pet_shield_plate']['parent'],'pet_shield_'+side)
 def test_shield_positions_match_profile_at_side_and_front(self):
  for p in PETS:
   for blend in [0,.25,.5,.75,1]:
    cfg=p['equipment']['shield'];env={'variable.pet_guard_blend':blend,**item_env('', 'shield')};updates={}
    for n,c in pose(p)['bones'].items():updates[n]={ch:sample.vector(v,0,env) for ch,v in c.items()}
    for side,sign in [('left',1),('right',-1)]:
     g=geom(p['id'],'shield_'+side);m=sample.matrices(g['bones'],updates);point=np.array([sign*cfg['side_position'][0],*cfg['side_position'][1:],1.]);expected=np.array([sign*cfg['side_position'][0],*cfg['side_position'][1:]])*(1-blend)+np.array([sign*cfg['front_position'][0],*cfg['front_position'][1:]])*blend
     np.testing.assert_allclose((m['pet_shield_'+side]@point)[:3],expected,atol=1e-8)
 def test_shield_front_outward_normal_and_side_normal(self):
  for p in PETS:
   self.assertLess((sample.rotation(p['equipment']['shield']['front_rotation'])@np.array([0,0,-1,0]))[2],-.99)
   self.assertGreater((sample.rotation(p['equipment']['shield']['side_rotation'])@np.array([0,0,-1,0]))[0],.99)
class GearRouting(unittest.TestCase):
 def test_tool_selector_has_native_and_rbow_entries(self):
  items=read(ROOT/'catalog/equipment/handhelds.json')['items'];self.assertEqual(len(items),41);self.assertEqual(len({i['id'] for i in items}),41)
  f=assign('variable.pet_tool_index')
  for i,item in enumerate(items,1):self.assertEqual(f(item_env(item['id'])),i)
  for item in ['','bow','crossbow','trident','shield','custom_pickaxe']:self.assertEqual(f(item_env(item)),0)
 def test_no_tool_replacement_in_first_person_or_human(self):
  f=assign('variable.pet_draw_tool')
  for tp in [False,True]:
   for gear in [False,True]:
    for index in [0,1,35]:self.assertEqual(bool(f({'variable.pet_replace_hands':tp and gear,'variable.pet_tool_index':index})),tp and gear and index>0)
 def test_native_hand_suppression_is_scoped_and_does_not_touch_pet_limbs(self):
  self.assertNotIn('animation.pet.hide_native_tool',read(RP/'animations/pet_shared.animation.json')['animations']);self.assertEqual(D['scripts']['hide_held_items'],'variable.pet_replace_hands');self.assertNotIn('pet_hide_native_tool',D['animations'])
 def test_only_one_tool_replica_render_route_can_be_active(self):
  entries=[e for e in D['render_controllers'] if isinstance(e,dict) and '.mouth_tool' in next(iter(e))]
  for ident in [0,1,2,999]:self.assertEqual(sum(bool(Expression(next(iter(e.values())))({'variable.pet_draw_tool':True,'variable.pet_model_id':ident})) for e in entries),1 if ident in [1,2] else 0)
 def test_glint_stale_item_id_is_rejected(self):
  f=assign('variable.pet_tool_glint');self.assertTrue(f({'variable.pet_tool_index':1},{'pet:tool_enchanted':True,'pet:tool_enchanted_for':1}));self.assertFalse(f({'variable.pet_tool_index':2},{'pet:tool_enchanted':True,'pet:tool_enchanted_for':1}))
 def test_shield_keeps_native_first_person_variables_and_aliases(self):
  old=read(ROOT/'upstream/shield.entity.json')['minecraft:attachable']['description'];new=read(RP/'attachables/shield.entity.json')['minecraft:attachable']['description']
  for k in ['textures','materials','animations']:self.assertEqual(new[k],old[k])
  self.assertEqual(new['scripts']['initialize'],old['scripts']['initialize']);self.assertEqual(new['scripts']['animate'],[{'wield':'variable.pet_shield_index == 0.0'}])
 def test_shield_routing_uses_owner_not_viewer_and_preserves_first_person(self):
  d=read(RP/'attachables/shield.entity.json')['minecraft:attachable']['description'];f=Expression(d['scripts']['pre_animation'][-1].split('=',1)[1].rstrip(';').replace('context.owning_entity->','owner.'))
  for owner in [0,1,2,999]:
   for first in [False,True]:
    for gear in [False,True]:self.assertEqual(f({'query.owner_identifier':'minecraft:player','owner.variable.pet_model_id':owner,'context.is_first_person':first,'owner.variable.pet_gear_fit':gear,'variable.pet_model_id':2}),owner if owner in [1,2] and gear and not first else 0)
 def test_new_boolean_properties_are_synchronized_and_bounded(self):
  props=read(ROOT/'behavior_pack/entities/player.json')['minecraft:entity']['description']['properties'];self.assertLessEqual(len(props),32)
  for key in ['pet:armor_fit','pet:gear_fit']:self.assertEqual(props[key],{'type':'bool','default':False,'client_sync':True})
 def test_no_inventory_mutation_in_tool_effects(self):
  text=(ROOT/'src/tool_effects.js').read_text()
  for token in ['setEquipment(', 'setItem(', 'addItem(', 'spawnEntity(', 'applyDamage(', 'new ItemStack']:self.assertNotIn(token,text)
