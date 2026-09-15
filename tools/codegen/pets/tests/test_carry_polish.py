"""0.4.1 regressions: policy/math/artifacts only, NOT a Minecraft engine simulation."""
from pathlib import Path
from itertools import product
import hashlib,json,sys,unittest
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
from carrying import records,selector
import animation_sample as sample
RP=ROOT/'resource_pack';D=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
_,PETS,_=load_catalog(ROOT);SIDE=records(ROOT);TOOL=read(ROOT/'catalog/equipment/handhelds.json')['items']
SIDE_IDS={r['id'] for r in SIDE};TOOL_IDS={r['id'] for r in TOOL}
KEYS={'pet_tool_index','pet_carry_main_index','pet_carry_off_index','pet_main_shield','pet_off_shield','pet_main_empty','pet_off_empty','pet_main_supported','pet_off_supported','pet_replace_hands','pet_draw_tool'}
ASSIGNS=[]
for line in D['scripts']['pre_animation']:
 key=line.split('=',1)[0].strip()
 if key.replace('variable.','') in KEYS:ASSIGNS.append((key,Expression(line.split('=',1)[1].strip().rstrip(';'))))
RC={}
for p in (RP/'render_controllers').glob('*.json'):RC.update(read(p)['render_controllers'])
REPLACEMENTS=[]
for row in D['render_controllers']:
 if not isinstance(row,dict):continue
 name,cond=next(iter(row.items()))
 if name.endswith('.mouth_tool') or '.carry_' in name or name.endswith('_replacement'):
  REPLACEMENTS.append((name,Expression(cond)))
def env_for(main='',off='',tp=True,gear=True,model=1):
 env={'variable.pet_tp':tp,'variable.pet_gear_fit':gear,'variable.pet_model_id':model,
      'item_mainhand':main.removeprefix('minecraft:'),'item_offhand':off.removeprefix('minecraft:')}
 env['query.is_item_name_any']=lambda slot,*ids:(off if slot=='slot.weapon.offhand' else main) in ids
 for key,expr in ASSIGNS:env[key]=expr(env)
 return env

def g(p,name):return read(RP/f'models/entity/pets/{p}/{name}.geo.json')['minecraft:geometry'][0]

class NativeHiding(unittest.TestCase):
 def test_dedicated_engine_switch_not_hand_bone_scale(self):
  self.assertEqual(D['scripts']['hide_held_items'],'variable.pet_replace_hands')
  self.assertNotIn('pet_hide_native_tool',D['animations'])
  self.assertIn('variable.pet_replace_hands',D['scripts']['variables'])
 def test_pair_policy_truth_table(self):
  main_items=['','minecraft:diamond_pickaxe','minecraft:iron_sword','minecraft:shield','minecraft:oak_boat','minecraft:water_bucket','minecraft:nether_brick','minecraft:filled_map','minecraft:bow','other:new_item']
  off_items=['','minecraft:shield','minecraft:arrow','minecraft:book','minecraft:filled_map','other:item']
  for main,off,tp,gear in product(main_items,off_items,[False,True],[False,True]):
   e=env_for(main,off,tp,gear)
   expected=tp and gear and (not main or main=='minecraft:shield' or main in TOOL_IDS|SIDE_IDS) and (not off or off=='minecraft:shield' or off in SIDE_IDS)
   self.assertEqual(bool(e['variable.pet_replace_hands']),expected,(main,off,tp,gear))
 def test_no_additive_duplicate_routes(self):
  for model in [1,2]:
   for main,off in product(['','minecraft:diamond_pickaxe','minecraft:oak_boat','minecraft:shield','minecraft:filled_map'],['','minecraft:shield','minecraft:arrow','minecraft:filled_map']):
    e=env_for(main,off,model=model)
    count=sum(bool(cond(e)) for _,cond in REPLACEMENTS)
    expected=(int(bool(main))+int(bool(off))) if e['variable.pet_replace_hands'] else 0
    self.assertEqual(count,expected,(model,main,off))
 def test_native_fallback_keeps_both_hands_not_half_replacement(self):
  for main,off in [('minecraft:diamond_pickaxe','minecraft:filled_map'),('other:weapon','minecraft:shield'),('minecraft:bow','minecraft:arrow')]:
   e=env_for(main,off);self.assertFalse(e['variable.pet_replace_hands']);self.assertFalse(any(cond(e) for _,cond in REPLACEMENTS))
 def test_first_person_never_hides_native_items(self):
  for model in [0,1,2]:
   e=env_for('minecraft:diamond_pickaxe','minecraft:shield',tp=False,model=model)
   self.assertFalse(Expression(D['scripts']['hide_held_items'])(e));self.assertFalse(any(cond(e) for _,cond in REPLACEMENTS))
 def test_gear_native_restores_both_hand_routes(self):
  e=env_for('minecraft:oak_boat','minecraft:shield',gear=False)
  self.assertFalse(e['variable.pet_replace_hands']);self.assertFalse(any(cond(e) for _,cond in REPLACEMENTS))
 def test_human_spectator_and_map_views_use_existing_tp_gate(self):
  expr=Expression(next(x for x in D['scripts']['pre_animation'] if x.startswith('variable.pet_tp =')).split('=',1)[1].rstrip(';'))
  for model,first,spectator,map_icon in product([0,1,2,999],[0,1],[0,1],[0,1]):
   result=expr({'variable.is_first_person':first,'query.is_spectator':spectator,'variable.map_face_icon':map_icon},{'pet:model_id':model})
   self.assertEqual(bool(result),model in [1,2] and not first and not spectator and not map_icon)
 def test_switch_sequence_does_not_keep_stale_replicas(self):
  for model in [1,2]:
   for main,expected in [('minecraft:diamond_pickaxe','mouth_tool'),('minecraft:oak_boat','carry_main'),('minecraft:water_bucket','carry_main'),('','none'),('minecraft:shield','shield_main_replacement'),('minecraft:iron_sword','mouth_tool')]:
    e=env_for(main,model=model);active=[n for n,c in REPLACEMENTS if c(e)]
    self.assertEqual(len(active),0 if expected=='none' else 1)
    if active:self.assertTrue(active[0].endswith(expected),active)

class CarryAssets(unittest.TestCase):
 def test_side_lookup_is_skipped_for_inactive_and_empty_hands(self):
  for tp,gear in [(False,True),(True,False),(False,False)]:
   e=env_for('minecraft:oak_boat','minecraft:book',tp=tp,gear=gear)
   self.assertEqual(e['variable.pet_carry_main_index'],0);self.assertEqual(e['variable.pet_carry_off_index'],0)
  e=env_for('minecraft:diamond_pickaxe','minecraft:shield')
  self.assertEqual(e['variable.pet_carry_main_index'],0);self.assertEqual(e['variable.pet_carry_off_index'],0)
 def test_explicit_unique_item_tables(self):
  self.assertEqual(len(SIDE),161);self.assertEqual(len(SIDE_IDS),len(SIDE));self.assertFalse(SIDE_IDS & TOOL_IDS)
  self.assertNotIn('minecraft:shield',SIDE_IDS);self.assertNotIn('minecraft:filled_map',SIDE_IDS)
 def test_all_side_indices_are_selected_live_in_each_hand(self):
  for hand in ['mainhand','offhand']:
   expr=Expression(selector(SIDE,'slot.weapon.'+hand))
   for i,item in enumerate(SIDE,1):
    env={'query.is_item_name_any':lambda slot,*names:item['id'] in names}
    self.assertEqual(expr(env),i)
   self.assertEqual(expr({'query.is_item_name_any':lambda *args:False}),0)
 def test_runtime_texture_and_geometry_arrays_are_in_range(self):
  for p in PETS:
   for hand in ['main','off']:
    rc=RC[f'controller.render.pet.{p["id"]}.carry_{hand}']
    for typ in ['geometries','textures']:
     values=rc['arrays'][typ]['Array.carry'];self.assertEqual(len(values),len(SIDE)+1)
     for v in values:
      aliases=D['geometry' if typ=='geometries' else 'textures'];self.assertIn(v.split('.',1)[1],aliases)
 def test_side_mount_is_opposite_equipped_offhand_shield(self):
  for p in PETS:
   cfg=p['equipment']['side_carry'];shield=p['equipment']['shield']['side_position']
   self.assertLess(cfg['sprite_position'][0]*shield[0],0);self.assertLess(cfg['cube_position'][0]*shield[0],0)
 def test_main_and_off_carry_are_mirrored(self):
  for p in PETS:
   for shape in ['sprite','cube']:
    a=next(b for b in g(p['id'],f'carry_main_{shape}')['bones'] if b['name']=='pet_carry_main')
    b=next(b for b in g(p['id'],f'carry_off_{shape}')['bones'] if b['name']=='pet_carry_off')
    self.assertEqual(a['parent'],b['parent']);self.assertEqual(a['parent'],'pet_body')
    self.assertEqual(a['pivot'][0],-b['pivot'][0]);self.assertEqual(a['pivot'][1:],b['pivot'][1:])
 def test_carried_objects_do_not_follow_head_nod_or_look(self):
  for p in PETS:
   gg=g(p['id'],'carry_main_sprite');point=next(b['pivot'] for b in gg['bones'] if b['name']=='pet_carry_main')
   before=sample.matrices(gg['bones'],{})['pet_carry_main']@np.array([*point,1])
   after=sample.matrices(gg['bones'],{'pet_head':{'rotation':np.array([30,25,0])}})['pet_carry_main']@np.array([*point,1])
   np.testing.assert_allclose(before,after)
 def test_side_cube_clears_back_and_flank_armor(self):
  for p in PETS:
   cfg=p['equipment']['side_carry'];inner_x=cfg['cube_position'][0]+cfg['cube_size']/2
   armor=read(ROOT/p['equipment']['armor_fit'])['slots']['chestplate']
   min_x=min(a['origin'][0] for a in armor)
   self.assertLess(inner_x,min_x)
 def test_uniform_blocks_have_six_complete_faces(self):
  for p in PETS:
   b=next(b for b in g(p['id'],'carry_main_cube')['bones'] if b['name']=='pet_carry_main')
   self.assertEqual(len(b['cubes']),1)
   self.assertTrue(all(v['uv_size']==[16,16] for v in b['cubes'][0]['uv'].values()))
 def test_mapped_food_and_material_icons_do_not_override_behavior_items(self):
  files={p.stem for p in (ROOT/'behavior_pack/items').glob('*.json')}
  self.assertEqual(files,{'morpher_book'})
 def test_at_most_one_mesh_per_hand_per_pet(self):
  for n,c in REPLACEMENTS:
   self.assertNotIn('query.life_time',str(c.ast)) # no timed swapping or ghost duplicates
  self.assertEqual(len(REPLACEMENTS),5*len(PETS))

class BakedGripAndPreservation(unittest.TestCase):
 def test_no_runtime_z_rotation_on_mouth_mount(self):
  for p in PETS:
   mount=next(b for b in g(p['id'],'tool_pickaxe')['bones'] if b['name']=='pet_tool_mount')
   self.assertEqual(mount['rotation'],[0,0,0])
 def test_handle_texel_centers_are_horizontal_in_exported_vertices(self):
  for p in PETS:
   for shape in ['pickaxe','sword','axe','shovel','hoe']:
    cubes=next(b for b in g(p['id'],'tool_'+shape)['bones'] if b['name']=='pet_tool_pixels')['cubes']
    uv={tuple(c['uv']['north']['uv']):np.array(c['pivot']) for c in cubes}
    a,b=uv[(3,12)],uv[(6,9)] # pixels along the same native diagonal handle
    self.assertAlmostEqual(a[1],b[1]);self.assertAlmostEqual(a[2],b[2]);self.assertGreater(abs(a[0]-b[0]),1)
 def test_texel_grip_stays_centered_through_nod(self):
  for p in PETS:
   gg=g(p['id'],'tool_pickaxe');point=np.array([*p['equipment']['mouth_sprite']['position'],1])
   for pitch in [-45,-20,0,20,45]:
    m=sample.matrices(gg['bones'],{'pet_head':{'rotation':np.array([pitch,0,0])}})
    np.testing.assert_allclose(m['pet_tool_mount']@point,m['pet_head']@point)
 def test_each_texel_rotation_is_local_not_about_world_origin(self):
  for p in PETS:
   cubes=next(b for b in g(p['id'],'tool_pickaxe')['bones'] if b['name']=='pet_tool_pixels')['cubes']
   for c in cubes:np.testing.assert_allclose(np.array(c['origin'])+np.array(c['size'])/2,c['pivot'])
 def test_all_original_pet_art_armor_and_rig_clip_inputs_unchanged(self):
  for name,sha in read(ROOT/'tests/confirmed_031_assets.json').items():
   self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),sha,name)
 def test_shield_pose_and_cubes_unchanged_from_user_confirmed_release(self):
  old=Path('/mnt/data/pets_work/ElleeDog_67_Pets_0.3.1')
  # Source archive includes an independent regression snapshot for portable tests.
  ref=read(ROOT/'tests/shield_031_reference.json')
  for p in PETS:
   for side in ['left','right']:
    now=g(p['id'],'shield_'+side)
    relevant=[b for b in now['bones'] if b['name'] in ['pet_shield_left','pet_shield_right','pet_shield_plate']]
    self.assertEqual(relevant,ref[p.get('variant_of',p['id'])][side])
   anim=read(RP/f'animations/pets/{p["id"]}.animation.json')['animations'][f'animation.pet.{p["id"]}.shield_pose']
   self.assertEqual(anim,ref[p.get('variant_of',p['id'])]['pose'])
 def test_shield_owning_attachable_explicitly_excludes_player_replacement(self):
  d=read(RP/'attachables/shield.entity.json')['minecraft:attachable']['description']
  for row in d['render_controllers']:
   cond=next(iter(row.values()));self.assertIn('context.owning_entity->variable.pet_replace_hands',cond);self.assertIn('!context.is_first_person',cond)
 def test_shield_first_person_animations_and_textures_unchanged(self):
  now=read(RP/'attachables/shield.entity.json')['minecraft:attachable']['description'];old=read(ROOT/'upstream/shield.entity.json')['minecraft:attachable']['description']
  for key in ['materials','textures','animations']:self.assertEqual(now[key],old[key])
  self.assertEqual(now['scripts']['initialize'],old['scripts']['initialize'])
 def test_armor_not_disabled_to_hide_tools(self):
  self.assertTrue(D['enable_attachables']);self.assertFalse(D.get('hide_armor',False))
  for f in (RP/'attachables').glob('*.player.json'):
   d=read(f)['minecraft:attachable']['description'];self.assertNotIn('pet_replace_hands',json.dumps(d))
 def test_property_budget_and_new_sync_fields(self):
  props=read(ROOT/'behavior_pack/entities/player.json')['minecraft:entity']['description']['properties'];self.assertLessEqual(len(props),32)
  self.assertEqual(props['pet:hand_height']['default'],0)
  for hand in ['main','off']:
   for key in [f'pet:carry_{hand}_enchanted',f'pet:carry_{hand}_enchanted_for',f'pet:{hand}_shield_enchanted']:self.assertTrue(props[key]['client_sync'])
 def test_native_glint_cannot_leak_to_different_side_item(self):
  for hand in ['main','off']:
   line=next(x for x in D['scripts']['pre_animation'] if x.startswith('variable.pet_carry_'+hand+'_glint ='))
   expr=Expression(line.split('=',1)[1].rstrip(';'));props={f'pet:carry_{hand}_enchanted':True,f'pet:carry_{hand}_enchanted_for':1}
   self.assertTrue(expr({f'variable.pet_carry_{hand}_index':1},props));self.assertFalse(expr({f'variable.pet_carry_{hand}_index':2},props))

if __name__=='__main__':unittest.main()
