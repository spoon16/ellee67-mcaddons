"""Regression tests for 0.4.3. Offline math/data checks, NOT Minecraft simulation."""
from pathlib import Path
from copy import deepcopy
from itertools import product
from io import BytesIO
import hashlib,json,sys,unittest,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
from seating import ride_clip,transformed_vertices,vertices
from rig_math import matrices
import animation_sample as sample
RP=ROOT/'resource_pack';BP=ROOT/'behavior_pack'
PROJECT,PETS,_=load_catalog(ROOT)
D=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
SHARED=read(RP/'animations/pet_shared.animation.json')['animations']

def anim(p):return read(RP/f'animations/pets/{p["id"]}.animation.json')['animations']
def geometry(p,part='model'):return read(RP/f'models/entity/pets/{p["id"]}/{part}.geo.json')['minecraft:geometry'][0]
def numeric_pose(p):return ride_clip(ROOT,p)['bones']
def expression_for_attachable(path):
 s=read(path)['minecraft:attachable']['description']['scripts']['pre_animation'][0]
 return Expression(s.split('=',1)[1].rstrip(';').replace('context.owning_entity->','owner.'))

class Book043(unittest.TestCase):
 def test_selected_option_is_three_and_hash_pinned(self):
  a=PROJECT['morpher_art'];self.assertEqual(a['selected_option'],3)
  self.assertEqual(hashlib.sha256((ROOT/a['source']).read_bytes()).hexdigest(),a['source_sha256'])
 def test_exported_book_is_exact_full_resize_of_approved_image(self):
  a=PROJECT['morpher_art'];expected=Image.open(ROOT/a['source']).convert('RGBA').resize((128,128),Image.Resampling.LANCZOS)
  actual=Image.open(RP/'textures/items/pet_morpher_book_043.png').convert('RGBA')
  self.assertEqual(actual.size,(128,128));self.assertEqual(actual.tobytes(),expected.tobytes())
 def test_book_is_transparent_green_artwork_not_old_tiny_sprite(self):
  ar=np.array(Image.open(RP/'textures/items/pet_morpher_book_043.png').convert('RGBA'))
  self.assertGreater(np.sum(ar[:,:,3]==0),1000);self.assertGreater(np.sum(ar[:,:,3]>127),5000)
  g=(ar[:,:,1]>ar[:,:,0]*1.15)&(ar[:,:,1]>ar[:,:,2]*1.15)&(ar[:,:,3]>127)
  self.assertGreater(np.sum(g),2500)
 def test_archive_contains_exact_new_art_and_not_old_filenames(self):
  with zipfile.ZipFile(ROOT/'dist/ElleeDog_67_Pets_v0.5.2.mcaddon') as outer:
   with zipfile.ZipFile(BytesIO(outer.read('ElleeDog_67_Pets_v0.5.2_RP.mcpack'))) as inner:
    self.assertEqual(inner.read('textures/items/pet_morpher_book_043.png'),(RP/'textures/items/pet_morpher_book_043.png').read_bytes())
    self.assertNotIn('textures/items/pet_morpher_book.png',inner.namelist())
 def test_green_book_side_mesh_uses_full_resolution(self):
  for p in PETS:
   g=geometry(p,'carry_main_book');self.assertEqual(g['description']['texture_width'],128)
   cubes=[c for b in g['bones'] for c in b.get('cubes',[])];self.assertEqual(len(cubes),1)
   self.assertEqual(cubes[0]['uv']['east']['uv_size'],[128,128])
 def test_detail_text_has_no_mechanical_paragraph(self):
  s=(BP/'scripts/morpher.js').read_text();self.assertIn('.body(petBiography(choice.pet))',s)
  for text in ['Choosing this form applies','Your items stay','Choose a pet to read','equipment display']:
   self.assertNotIn(text,s)

class Restoration043(unittest.TestCase):
 def test_fixed_native_and_pet_armor_geometries_never_swap(self):
  files=list((RP/'attachables').glob('*.player.json'));self.assertEqual(len(files),28)
  cs=read(RP/'render_controllers/pet_armor.render_controllers.json')['render_controllers']
  for p in files:
   d=read(p)['minecraft:attachable']['description']
   self.assertEqual(d['render_controllers'],['controller.render.pet.armor_native']+[f'controller.render.pet.armor_{p["id"]}' for p in PETS])
   self.assertEqual(d['scripts']['animate'],['offset'])
   for n in d['render_controllers']:
    self.assertNotIn('arrays',cs[n])
    self.assertEqual(cs[n].get('rebuild_animation_matrices',False),n!='controller.render.pet.armor_native')
 def test_returned_player_ignores_stale_pet_variables(self):
  for path in (RP/'attachables').glob('*.player.json'):
   e=expression_for_attachable(path)
   env={'query.owner_identifier':'minecraft:player','context.is_first_person':False,
        'owner.variable.pet_model_id':3,'owner.variable.pet_armor_fit':1,
        'owner.query.has_property':lambda k:True,'owner.query.property':lambda k:0 if k=='pet:model_id' else False}
   self.assertEqual(e(env),0)
 def test_live_pet_form_works_despite_stale_native_variables(self):
  e=expression_for_attachable(RP/'attachables/iron_chestplate.player.json')
  for p in PETS:
   env={'query.owner_identifier':'minecraft:player','context.is_first_person':False,
        'owner.variable.pet_model_id':0,'owner.variable.pet_armor_fit':0,
        'owner.query.has_property':lambda k:True,'owner.query.property':lambda k:p['wire_id'] if k=='pet:model_id' else True}
   self.assertEqual(e(env),p['wire_id'])
 def test_native_root_no_longer_requires_pet_reset(self):
  self.assertEqual(D['scripts']['animate'][0],{'root':'1.0'})
  self.assertNotIn('pet_native_reset',D['animations']);self.assertNotIn('animation.pet.native_reset',SHARED)
 def test_native_pose_cannot_be_overwritten_by_any_pet_world_clip(self):
  for p in PETS:
   for name,a in anim(p).items():
    self.assertTrue(all(n.startswith('pet_') for n in a['bones']),name)
 def test_no_inventory_re_equip_or_hidden_native_effect_fix(self):
  for name in ['appearance.js','seating.js']:
   s=(BP/'scripts'/name).read_text()
   for call in ['.setEquipment(','.setItem(','.teleport(','.spawnEntity(','.addEffect(','.runCommand(']:self.assertNotIn(call,s)
  self.assertNotIn('reinforceNative',(BP/'scripts/main.js').read_text())

class Seating043(unittest.TestCase):
 def test_torso_is_truly_upright_in_seated_pose(self):
  for p in PETS:
   pitch=numeric_pose(p)['pet_body']['rotation'][0]
   self.assertGreaterEqual(pitch,45);self.assertLessEqual(pitch,60)
 def test_all_four_paw_bottoms_contact_zero_plane(self):
  for p in PETS:
   g=geometry(p);pose=numeric_pose(p)
   for side in ['left','right']:
    for leg in ['front','rear']:
     pts=transformed_vertices(g,pose,[f'pet_{leg}_{side}_paw'])
     self.assertAlmostEqual(pts[:,1].min(),0,places=6,msg=(p['id'],leg,side))
 def test_front_shins_and_all_paw_soles_are_level(self):
  for p in PETS:
   g=geometry(p);pose={k:{a:np.array(b) for a,b in v.items()} for k,v in numeric_pose(p).items()};ms=matrices(g['bones'],pose)
   for side in ['left','right']:
    np.testing.assert_allclose(ms['pet_front_'+side][:3,:3]@np.array([0,1,0]),[0,1,0],atol=1e-7)
    for leg in ['front','rear']:
     np.testing.assert_allclose(ms[f'pet_{leg}_{side}_paw'][:3,:3]@np.array([0,1,0]),[0,1,0],atol=1e-7)
 def test_hind_legs_fold_forward_not_stand(self):
  for p in PETS:
   g=geometry(p);po={k:{a:np.array(b) for a,b in v.items()} for k,v in numeric_pose(p).items()};ms=matrices(g['bones'],po)
   for side in ['left','right']:
    v=ms['pet_rear_'+side][:3,:3]@np.array([0,1,0]);self.assertLess(abs(v[1]),.2);self.assertGreater(abs(v[2]),.9)
 def test_head_is_counter_rotated_upright(self):
  for p in PETS:
   pose={k:{a:np.array(b) for a,b in v.items()} for k,v in numeric_pose(p).items()};m=matrices(geometry(p)['bones'],pose)
   np.testing.assert_allclose(m['pet_head'][:3,:3],[ [1,0,0],[0,1,0],[0,0,1] ],atol=1e-7)
 def test_tail_does_not_start_under_seat(self):
  for p in PETS:
   g=geometry(p);pts=transformed_vertices(g,numeric_pose(p),[b['name'] for b in g['bones'] if b['name'].startswith('pet_tail')])
   self.assertGreaterEqual(pts[:,1].min(),.19)
 def test_generated_ride_not_scaled_by_canine_feline_gait(self):
  for p in PETS:
   exported=anim(p)[f'animation.pet.{p["id"]}.ride']['bones']
   for k,v in numeric_pose(p).items():self.assertEqual(exported[k],v)
 def test_body_armor_inherits_same_seated_bones(self):
  for p in PETS:
   bare=geometry(p);armor=geometry(p,'armor_chestplate')
   po={k:{a:np.array(b) for a,b in v.items()} for k,v in numeric_pose(p).items()}
   a=matrices(bare['bones'],po);b=matrices(armor['bones'],po)
   for n in ['pet_root','pet_body','pet_head']:np.testing.assert_allclose(a[n],b[n])
 def test_seat_alignment_never_offsets_the_native_player_root(self):
  a=read(RP/'animations/pet_seating.animation.json')['animations']['animation.pet.seat_align']
  self.assertEqual(set(a['bones']),{'pet_root'})
  e=Expression(a['bones']['pet_root']['position'][1]);self.assertEqual(e({'query.is_riding':True},{'pet:seat_lift':12}),12)
  self.assertEqual(e({'query.is_riding':False},{'pet:seat_lift':12}),0)
 def test_seat_alignment_not_enabled_on_player_or_first_person(self):
  line=next(x['pet_seat_align'] for x in D['scripts']['animate'] if 'pet_seat_align' in x)
  e=Expression(line)
  self.assertFalse(e({'variable.pet_tp':False,'query.is_riding':True}));self.assertFalse(e({'variable.pet_tp':True,'query.is_riding':False}))
  self.assertTrue(e({'variable.pet_tp':True,'query.is_riding':True}))
 def test_standing_near_stairs_does_not_select_ride_animation(self):
  for p in PETS:
   states=read(RP/f'animation_controllers/pets/{p["id"]}.animation_controllers.json')['animation_controllers'][f'controller.animation.pet.{p["id"]}.locomotion']['states']
   for state in states.values():
    for rule in state.get('transitions',[]):
     if 'ride' in rule:self.assertFalse(Expression(rule['ride'])({'query.is_riding':False}))
 def test_alignment_properties_synced_and_under_budget(self):
  ps=read(BP/'entities/player.json')['minecraft:entity']['description']['properties'];self.assertLessEqual(len(ps),32)
  for k in ['pet:seat_lift','pet:seat_kind']:self.assertTrue(ps[k]['client_sync']);self.assertEqual(ps[k]['default'],0)
 def test_approved_motion_hashes_are_preserved(self):
  from native_armor_reference import assert_unchanged_content
  assert_unchanged_content(self)

class Carry043(unittest.TestCase):
 def test_reported_items_explicitly_mapped(self):
  items={i['id']:i for i in read(ROOT/'catalog/equipment/side_carry.json')['items']}
  self.assertEqual(items['minecraft:saddle']['shape'],'sprite')
  self.assertEqual(items['minecraft:red_nether_brick_stairs']['shape'],'stairs')
 def test_stair_item_is_two_step_cuboids(self):
  for p in PETS:
   g=geometry(p,'carry_main_stairs');cs=[c for b in g['bones'] for c in b.get('cubes',[])]
   self.assertEqual(len(cs),2);self.assertEqual(cs[0]['size'][1],cs[1]['size'][1]);self.assertEqual(cs[1]['size'][2],cs[0]['size'][2]/2)
 def test_side_carrier_follows_torso_opposite_offhand_shield(self):
  for p in PETS:
   b=next(b for b in geometry(p,'carry_main_sprite')['bones'] if b['name']=='pet_carry_main')
   self.assertEqual(b['parent'],'pet_body');self.assertLess(b['pivot'][0]*p['equipment']['shield']['side_position'][0],0)
 def test_no_new_gameplay_items_for_native_saddles_or_stairs(self):
  for p in (BP/'items').glob('*.json'):self.assertFalse(read(p)['minecraft:item']['description']['identifier'].startswith('minecraft:'))

if __name__=='__main__':unittest.main()
