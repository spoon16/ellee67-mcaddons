"""Matched Rbow integration: structural/data/geometry proofs, not Minecraft simulation."""
from pathlib import Path
from copy import deepcopy
from itertools import product
from io import BytesIO
import hashlib,json,sys,unittest,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from rbow_compat import merge_player
from molang_subset import Expression
import animation_sample as sample
from test_carry_polish import env_for,REPLACEMENTS,TOOL,SIDE
P=ROOT/'behavior_pack';Q=ROOT/'resource_pack';B=ROOT/'rbow_behavior_pack';R=ROOT/'rbow_resource_pack';SRC=ROOT/'integration/rbow_1.2.0'
PETS=load_catalog(ROOT)[1];GEAR=[x for x in TOOL if x['id'].startswith('elleedog:')]
SIDES=[x for x in SIDE if x['id'].startswith('elleedog:')]
VERSION='.'.join(map(str,read(ROOT/'project.json')['version']))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def geo(pet,name):return read(Q/f'models/entity/pets/{pet}/{name}.geo.json')['minecraft:geometry'][0]
class SharedPlayer(unittest.TestCase):
 def test_both_orders_select_identical_player_schema(self):
  a=read(P/'entities/player.json');b=read(B/'entities/player.json')
  self.assertEqual(a,b);self.assertEqual((P/'entities/player.json').read_bytes(),(B/'entities/player.json').read_bytes())
  for stack in [[a,b],[b,a]]:
   selected=stack[-1]['minecraft:entity']['description']['properties']
   self.assertIn('pet:model_id',selected);self.assertIn('elleedog:rbow_armor_count',selected);self.assertEqual(len(selected),20)
 def test_model_and_knockback_fields_keep_original_definitions(self):
  now=read(P/'entities/player.json')['minecraft:entity'];old=read(ROOT/'integration/pets_045_player.json')['minecraft:entity'];rb=read(SRC/'behavior_pack/entities/player.json')['minecraft:entity']
  for k,v in old['description']['properties'].items():self.assertEqual(now['description']['properties'][k],v)
  for k,v in rb['description']['properties'].items():self.assertEqual(now['description']['properties'][k],v)
 def test_all_rbow_armor_count_triggers_preserved(self):
  now=read(P/'entities/player.json')['minecraft:entity'];rb=read(SRC/'behavior_pack/entities/player.json')['minecraft:entity']
  self.assertEqual(now['components']['minecraft:environment_sensor'],rb['components']['minecraft:environment_sensor'])
  for group in ['component_groups','events']:
   for k,v in rb[group].items():self.assertEqual(now[group][k],v)
 def test_no_undeclared_event_properties(self):
  for folder in [P,B]:
   d=read(folder/'entities/player.json')['minecraft:entity'];props=d['description']['properties']
   def walk(x):
    if isinstance(x,dict):
     for key in x.get('set_property',{}):self.assertIn(key,props)
     for v in x.values():walk(v)
    elif isinstance(x,list):
     for v in x:walk(v)
   walk(d);self.assertNotIn('pet:form',json.dumps(d))
 def test_legacy_events_point_to_current_models(self):
  events=read(P/'entities/player.json')['minecraft:entity']['events']
  for name,n in [('pet:become_human',0),('pet:become_carter',1)]:
   vals=events[name]['set_property'];self.assertEqual(vals['pet:model_id'],n)
   self.assertEqual(vals['pet:armor_fit'],bool(n));self.assertEqual(vals['pet:gear_fit'],bool(n))
 def test_merge_rejects_conflicting_native_mechanics(self):
  a=read(P/'entities/player.json');b=read(SRC/'behavior_pack/entities/player.json');b['minecraft:entity']['components']['minecraft:attack']['damage']=900
  with self.assertRaisesRegex(ValueError,'component conflict'):merge_player(a,b)
 def test_merge_rejects_conflicting_property_type(self):
  a=read(P/'entities/player.json');b=read(SRC/'behavior_pack/entities/player.json');b['minecraft:entity']['description']['properties']['pet:model_id']={'type':'bool','default':False}
  with self.assertRaisesRegex(ValueError,'Property conflict'):merge_player(a,b)
class PairPackaging(unittest.TestCase):
 def test_original_four_pack_and_module_uuids_preserved(self):
  for folder,original in [(P,ROOT/'baseline/0.2.1/behavior_pack'),(Q,ROOT/'baseline/0.2.1/resource_pack'),(B,SRC/'behavior_pack'),(R,SRC/'resource_pack')]:
   a=read(folder/'manifest.json');b=read(original/'manifest.json');self.assertEqual(a['header']['uuid'],b['header']['uuid']);self.assertEqual([m['uuid'] for m in a['modules']],[m['uuid'] for m in b['modules']])
 def test_dependencies_are_closed_acyclic_and_requested_by_pets(self):
  ms=[read(f/'manifest.json') for f in [P,Q,B,R]];by={m['header']['uuid']:m for m in ms};seen=set();active=set()
  def visit(n):
   self.assertNotIn(n,active);active.add(n)
   for dep in by[n].get('dependencies',[]):
    if 'uuid' in dep:
     self.assertIn(dep['uuid'],by);self.assertEqual(dep['version'],by[dep['uuid']]['header']['version']);visit(dep['uuid'])
   active.remove(n);seen.add(n)
  visit(ms[0]['header']['uuid']);self.assertEqual(seen,set(by))
 def test_scripts_registered_once_and_keep_original_entrypoints(self):
  ms=[read(f/'manifest.json') for f in [P,B]]
  self.assertEqual([m['modules'][1]['entry'] for m in ms],['scripts/main.js','scripts/bootstrap.js'])
  for f in ['main.js','rules.js','bootstrap.js','legacy_drops.js','legacy_drop_logic.js']:
   self.assertEqual((B/'scripts'/f).read_bytes(),(SRC/'behavior_pack/scripts'/f).read_bytes())
  self.assertFalse((P/'scripts/rules.js').exists())
 def test_all_rbow_gameplay_files_unchanged_except_player_and_manifest(self):
  for f in (SRC/'behavior_pack').rglob('*'):
   if f.is_file() and f.relative_to(SRC/'behavior_pack').as_posix() not in ['manifest.json','entities/player.json']:
    self.assertEqual(f.read_bytes(),(B/f.relative_to(SRC/'behavior_pack')).read_bytes(),str(f))
 def test_all_twenty_rbow_runtime_textures_are_identical(self):
  files=list((SRC/'resource_pack/textures').rglob('*.png'));self.assertEqual(len(files),20)
  for f in files:self.assertEqual(f.read_bytes(),(R/f.relative_to(SRC/'resource_pack')).read_bytes())
 def test_existing_pets_art_animation_armor_unchanged(self):
  from native_armor_reference import assert_unchanged_content
  assert_unchanged_content(self)
 def test_existing_catalog_entries_are_prefix_identical(self):
  for name,key in [('armor_materials','materials'),('handhelds','items'),('side_carry','items')]:
   old=read(ROOT/f'integration/pets_045_{name}.json')[key];new=read(ROOT/f'catalog/equipment/{name}.json')[key];self.assertEqual(new[:len(old)],old)
 def test_only_one_owner_for_each_resource_definition(self):
  seen={}
  for folder in [Q,R]:
   for f in folder.rglob('*.json'):
    d=read(f);ids=[]
    if not isinstance(d,dict):continue
    for kind in ['minecraft:client_entity','minecraft:attachable']:
     if kind in d:ids.append(kind+':'+d[kind]['description']['identifier'])
    for kind in ['animations','animation_controllers','render_controllers']:
     if kind in d:ids.extend(kind+':'+k for k in d[kind])
    ids.extend('geometry:'+g['description']['identifier'] for g in d.get('minecraft:geometry',[]))
    for ident in ids:self.assertNotIn(ident,seen,(ident,f,seen.get(ident)));seen[ident]=str(f)
 def test_nested_installer_contains_four_matching_packs(self):
  names={f'ElleeDog_67_Pets_v{VERSION}_BP.mcpack':P,f'ElleeDog_67_Pets_v{VERSION}_RP.mcpack':Q,'67_Rbow_Ore_Mod_v1.2.3_Pets_BP.mcpack':B,'67_Rbow_Ore_Mod_v1.2.3_Pets_RP.mcpack':R}
  with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{VERSION}.mcaddon') as outer:
   self.assertEqual(set(outer.namelist()),set(names))
   for name,folder in names.items():
    with zipfile.ZipFile(BytesIO(outer.read(name))) as z:
     self.assertIsNone(z.testzip());self.assertEqual(set(z.namelist()),{str(f.relative_to(folder)) for f in folder.rglob('*') if f.is_file()})
     for n in z.namelist():self.assertEqual(z.read(n),(folder/n).read_bytes())
 def test_every_pack_has_its_original_artwork(self):
  for folder in [P,Q]:self.assertEqual((folder/'pack_icon.png').read_bytes(),(ROOT/'assets/shared/pack_icon.png').read_bytes())
  for folder in [B,R]:self.assertEqual((folder/'pack_icon.png').read_bytes(),(SRC/folder.name.replace('rbow_','')/'pack_icon.png').read_bytes())
class EquipmentIntegration(unittest.TestCase):
 def test_exact_rbow_equipment_scope(self):
  self.assertEqual({i['id'] for i in GEAR},{'elleedog:rbow_'+s for s in ['sword','pickaxe','axe','shovel','hoe','spear']})
  self.assertEqual(len(SIDES),10)
 def test_rbow_high_resolution_meshes_match_source_opaque_pixels(self):
  for pet in PETS:
   for item in GEAR:
    g=geo(pet['id'],'tool_'+item['shape']);self.assertEqual(g['description']['texture_width'],32)
    tex=Image.open(ROOT/item['source_texture']).convert('RGBA');expected={(x,y) for y in range(32) for x in range(32) if tex.getpixel((x,y))[3]>127}
    b=next(b for b in g['bones'] if b['name']=='pet_tool_pixels');uvs={tuple(c['uv']['north']['uv']) for c in b['cubes']}
    self.assertEqual(uvs,expected);self.assertLessEqual(len(b['cubes']),300)
 def test_rbow_handle_baked_horizontal_at_mouth_not_relying_on_parent_rotation(self):
  for pet in PETS:
   for item in GEAR:
    g=geo(pet['id'],'tool_'+item['shape']);by={b['name']:b for b in g['bones']}
    self.assertEqual(by['pet_tool_mount']['parent'],'pet_head');self.assertEqual(by['pet_tool_mount']['rotation'],[0,0,0])
    # Two adjacent opaque centers on a down-left/up-right handle line have equal height.
    uv={tuple(c['uv']['north']['uv']):c['pivot'] for c in by['pet_tool_pixels']['cubes']}
    gx,gy=item['grip_pixel'];x,y=int(gx),int(gy)
    pairs=[((u,v),(u+1,v-1)) for u,v in uv if abs(u-x)<=2 and abs(v-y)<=2 and (u+1,v-1) in uv]
    self.assertTrue(pairs,item['id'])
    for a,b in pairs:self.assertAlmostEqual(uv[a][1],uv[b][1]);self.assertAlmostEqual(uv[a][2],uv[b][2])
 def test_mouth_meshes_follow_head_in_all_existing_poses(self):
  for pet in PETS:
   sample.ANIMS={k.replace(f'animation.pet.{pet["id"]}.','animation.pet.'):v for k,v in read(Q/f'animations/pets/{pet["id"]}.animation.json')['animations'].items()}
   for item in GEAR:
    g=geo(pet['id'],'tool_'+item['shape']);point=np.array([*pet['equipment']['mouth_sprite']['position'],1])
    for pose in ['walk','run','ride','attack']:
     matrices=sample.matrices(g['bones'],sample.pose_updates(pose,.25,attack=.5,look_x=15,look_y=-15))
     np.testing.assert_allclose(matrices['pet_tool_mount']@point,matrices['pet_head']@point)
 def test_exactly_one_rbow_tool_and_one_shield_route_per_pet(self):
  for pet,item,shield in product(PETS,GEAR,['','minecraft:shield']):
   env=env_for(item['id'],shield,model=pet['wire_id'])
   active=[n for n,c in REPLACEMENTS if c(env)];self.assertEqual(len(active),1+bool(shield));self.assertTrue(any(n.endswith('.mouth_tool') for n in active))
 def test_no_rbow_replicas_in_first_person_or_native_gear(self):
  for item in GEAR:
   for env in [env_for(item['id'],tp=False),env_for(item['id'],gear=False)]:
    self.assertFalse(env['variable.pet_replace_hands']);self.assertFalse(any(c(env) for _,c in REPLACEMENTS))
 def test_rbow_side_items_keep_shield_opposite(self):
  for pet,item in product(PETS,SIDES):
   env=env_for(item['id'],'minecraft:shield',model=pet['wire_id']);active=[n for n,c in REPLACEMENTS if c(env)]
   self.assertEqual(len(active),2);self.assertTrue(any(n.endswith('carry_main') for n in active));self.assertTrue(any(n.endswith('shield_off_replacement') for n in active))
 def test_spear_native_assets_animations_and_sound_exact(self):
  old=read(SRC/'resource_pack/attachables/rbow_spear_native.json')['minecraft:attachable']['description'];now=read(Q/'attachables/rbow_spear_native.json')['minecraft:attachable']['description']
  for k,v in old.items():
   if k!='render_controllers':self.assertEqual(now[k],v)
  self.assertFalse((R/'attachables/rbow_spear_native.json').exists())
 def test_spear_native_visibility_gate(self):
  d=read(Q/'attachables/rbow_spear_native.json')['minecraft:attachable']['description'];cond=next(iter(d['render_controllers'][0].values())).replace('context.owning_entity->','owner.')
  expr=Expression(cond)
  for owner,first,replacement in product(['minecraft:player','minecraft:armor_stand'],[False,True],[False,True]):
   actual=expr({'query.owner_identifier':owner,'context.is_first_person':first,'owner.variable.pet_replace_hands':replacement})
   self.assertEqual(actual,not(owner=='minecraft:player' and not first and replacement))
 def test_spear_combat_and_use_components_not_rewritten(self):
  self.assertEqual((B/'items/rbow_spear.json').read_bytes(),(SRC/'behavior_pack/items/rbow_spear.json').read_bytes())
  c=read(B/'items/rbow_spear.json')['minecraft:item']['components']
  for name in ['minecraft:piercing_weapon','minecraft:kinetic_weapon','minecraft:cooldown','minecraft:swing_duration','minecraft:use_modifiers']:self.assertIn(name,c)
 def test_rbow_armor_uses_matching_native_fields_and_pet_shape(self):
  for slot in ['helmet','chestplate','leggings','boots']:
   now=read(Q/f'attachables/rbow_{slot}.player.json')['minecraft:attachable']['description'];old=read(SRC/f'resource_pack/attachables/rbow_{slot}.player.json')['minecraft:attachable']['description']
   for name in ['identifier','materials','textures']:self.assertEqual(now[name],old[name])
   self.assertEqual(now['geometry']['default'],old['geometry']['default']);self.assertFalse((R/f'attachables/rbow_{slot}.player.json').exists())
   for pet in PETS:self.assertEqual(now['geometry']['pet_'+pet['id']],f'geometry.pet.{pet["id"]}.armor.{slot}')
 def test_rbow_generic_armor_on_nonplayers_unchanged(self):
  for slot in ['helmet','chestplate','leggings','boots']:self.assertEqual((R/f'attachables/rbow_{slot}.json').read_bytes(),(SRC/f'resource_pack/attachables/rbow_{slot}.json').read_bytes())
 def test_rbow_armor_live_owner_selection_for_all_forms_and_mixed_materials(self):
  for slot in ['helmet','chestplate','leggings','boots']:
   d=read(Q/f'attachables/rbow_{slot}.player.json')['minecraft:attachable']['description']
   expr=Expression(d['scripts']['pre_animation'][0].split('=',1)[1].strip().rstrip(';').replace('context.owning_entity->','owner.'))
   for model,first,fit in product([0,1,2,3,999],[0,1],[0,1]):
    props={'pet:model_id':model,'pet:armor_fit':fit}
    env={'query.owner_identifier':'minecraft:player','context.is_first_person':first,'owner.query.has_property':lambda k:k in props,'owner.query.property':lambda k:props[k]}
    self.assertEqual(expr(env),model if model in [1,2,3] and fit and not first else 0)
 def test_trim_rendering_inputs_not_replaced_by_untrimmed_custom_shader(self):
  rc=read(Q/'render_controllers/pet_armor.render_controllers.json')['render_controllers']['controller.render.pet.armor_native']
  self.assertIn('variable.has_trim ? variable.trim_path : Texture.default',rc['textures'])
  for slot in ['helmet','chestplate','leggings','boots']:
   c=read(B/f'items/rbow_{slot}.json')['minecraft:item']['components'];self.assertIn('minecraft:trimmable_armors',c['minecraft:tags']['tags'])
 def test_side_block_atlases_use_original_top_and_side(self):
  for name in ['rbow_block','rbow_ore','deepslate_rbow_ore']:
   atlas=Image.open(Q/f'textures/entity/pets/rbow/{name}_carry_atlas.png').convert('RGBA')
   side=Image.open(R/f'textures/blocks/{name}.png').convert('RGBA');top=Image.open(R/'textures/blocks/rbow_block_top.png').convert('RGBA') if name=='rbow_block' else side
   self.assertEqual(atlas.crop((0,0,32,32)).tobytes(),side.tobytes());self.assertEqual(atlas.crop((32,0,64,32)).tobytes(),top.tobytes())
 def test_rbow_full_item_texture_paths_exist_in_companion(self):
  for item in GEAR:
   self.assertTrue((R/(item['texture']+'.png')).exists())
  for item in SIDES:
   self.assertTrue((R/(item['texture']+'.png')).exists() or (Q/(item['texture']+'.png')).exists())
