"""Static/compiler and explicit mathematical tests, NOT an engine/network simulation."""
from pathlib import Path
from copy import deepcopy
from itertools import product
import hashlib,io,json,re,shutil,sys,tempfile,unittest,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,write,load_catalog,CatalogError
from build import build,mapped
from new_pet import add_pet
from molang_subset import Expression
import animation_sample as sample
BP=ROOT/'behavior_pack';RP=ROOT/'resource_pack';BASE=ROOT/'baseline/0.2.1'
PROJECT,PETS,IDS=load_catalog(ROOT)
PLAYER=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
VERSION=PROJECT['version']; VERSION_STR='.'.join(map(str, VERSION))
ANIMS={};CONTROLLERS={};RENDERS={};GEOMETRIES={}
for p in (RP/'animations').rglob('*.json'):ANIMS.update(read(p)['animations'])
for p in (RP/'animation_controllers').rglob('*.json'):CONTROLLERS.update(read(p)['animation_controllers'])
for p in (RP/'render_controllers').rglob('*.json'):RENDERS.update(read(p)['render_controllers'])
for p in (RP/'models').rglob('*.json'):
 for g in read(p)['minecraft:geometry']:GEOMETRIES[g['description']['identifier']]=g

def assignment(name):
 line=next(s for s in PLAYER['scripts']['pre_animation'] if s.startswith(name+' ='))
 return Expression(line.split('=',1)[1].rstrip('; '))
INDEX=assignment('variable.pet_index');ACTIVE=assignment('variable.pet_active');TP=assignment('variable.pet_tp');PAWS=assignment('variable.pet_fp_paws')
def setup_pet(ident):sample.ANIMS={k.replace(f'animation.pet.{ident}.','animation.pet.'):v for k,v in ANIMS.items() if k.startswith(f'animation.pet.{ident}.')}
class CatalogTests(unittest.TestCase):
 def fixture(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);target=Path(tmp.name)/'src'
  def ignore(source,names):
   omitted={'__pycache__','node_results.txt','test_results.txt'}
   if Path(source)==ROOT:omitted.update({'dist','previews','behavior_pack','resource_pack'})
   return omitted.intersection(names)
  shutil.copytree(ROOT,target,ignore=ignore)
  return target
 def test_three_requested_pets_share_runtime(self):
  self.assertEqual([p['id'] for p in PETS],['carter','mochi','casper']);self.assertEqual(IDS['reserved'],{'carter':1,'mochi':2,'casper':3})
  core=(ROOT/'src/core.js').read_text();self.assertNotIn("if (form === 'mochi')",core);self.assertIn('MODEL_BY_ID',core)
 def test_int_state_not_small_enum(self):
  p=read(BP/'entities/player.json')['minecraft:entity']['description']['properties'];self.assertNotIn('pet:form',p);self.assertEqual(p['pet:model_id'],{'type':'int','range':[0,4095],'default':0,'client_sync':True})
 def test_wire_ids_not_display_order(self):
  r=self.fixture();p=read(r/'catalog/pets/mochi.json');p['order']=0;write(r/'catalog/pets/mochi.json',p)
  _,ps,_=load_catalog(r);self.assertEqual([p['id'] for p in ps],['mochi','carter','casper']);self.assertEqual({p['id']:p['wire_id'] for p in ps},{'carter':1,'mochi':2,'casper':3})
 def test_new_pet_command_changes_no_core_code(self):
  r=self.fixture();before={p.name:p.read_bytes() for p in (r/'src').glob('*.js') if p.name!='catalog.generated.js'}
  n=add_pet(r,'buddy','Buddy','carter');self.assertEqual(n,4);build(r)
  for filename,data in before.items():self.assertEqual((r/'src'/filename).read_bytes(),data)
  player=read(r/'resource_pack/entity/player.entity.json')['minecraft:client_entity']['description'];self.assertIn('pet_buddy',player['geometry'])
  self.assertTrue((r/'resource_pack/models/entity/pets/buddy/armor_boots.geo.json').exists())
 def test_texture_variant_reuses_source_geometry_and_fit(self):
  r=self.fixture();add_pet(r,'oreo','Oreo','mochi',variant=True);p=read(r/'catalog/pets/oreo.json');self.assertEqual(p['model'],'assets/pets/mochi/model.geo.json');self.assertEqual(p['equipment']['armor_fit'],'assets/pets/mochi/armor_fit.json');self.assertEqual(p['texture'],'assets/pets/oreo/coat.png');load_catalog(r)
 def test_compiler_accepts_more_than_sixteen_pet_selections(self):
  r=self.fixture()
  for i in range(17):add_pet(r,f'testpet{i}',f'Test pet {i}','carter',variant=True)
  result=build(r);self.assertEqual(len(result['pets']),20)
  p=read(r/'behavior_pack/entities/player.json')['minecraft:entity']['description']['properties'];self.assertEqual(p['pet:model_id']['type'],'int')
 def test_duplicate_wire_id_rejected(self):
  r=self.fixture();ids=read(r/'catalog/wire_ids.json');ids['reserved']['mochi']=1;write(r/'catalog/wire_ids.json',ids)
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_retired_id_never_reused(self):
  r=self.fixture();ids=read(r/'catalog/wire_ids.json');ids['retired']['old_friend']=9;write(r/'catalog/wire_ids.json',ids)
  self.assertEqual(add_pet(r,'new_friend','New Friend','carter'),10)
  with self.assertRaises(CatalogError):add_pet(r,'old_friend','Bad reuse','carter')
 def test_missing_pet_asset_rejected(self):
  r=self.fixture();(r/'assets/pets/mochi/coat.png').unlink()
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_path_escape_rejected(self):
  r=self.fixture();d=read(r/'catalog/pets/mochi.json');d['model']='../../etc/passwd';write(r/'catalog/pets/mochi.json',d)
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_native_hand_bind_frame_mismatch_rejected(self):
  r=self.fixture();p=r/'assets/pets/mochi/model.geo.json';d=read(p);next(b for b in d['minecraft:geometry'][0]['bones'] if b['name']=='body')['pivot'][1]=10;write(p,d)
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_invalid_hand_default_rejected(self):
  r=self.fixture();p=r/'catalog/pets/mochi.json';d=read(p);d['first_person']['default_hand_height']=99;write(p,d)
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_missing_required_bone_rejected(self):
  r=self.fixture();p=r/'assets/pets/mochi/model.geo.json';d=read(p);d['minecraft:geometry'][0]['bones']=[b for b in d['minecraft:geometry'][0]['bones'] if b['name']!='pet_front_right'];write(p,d)
  with self.assertRaises(CatalogError):load_catalog(r)
 def test_missing_armor_parent_rejected(self):
  r=self.fixture();p=r/'assets/pets/mochi/armor_fit.json';d=read(p);d['slots']['boots'][0]['bone']='not_a_bone';write(p,d)
  with self.assertRaises(CatalogError):load_catalog(r)

class AssetTests(unittest.TestCase):
 def test_all_output_json_is_strict_and_has_no_duplicate_keys(self):
  for folder in [BP,RP]:
   for path in folder.rglob('*.json'):read(path)
 def test_vanilla_player_mechanics_are_unchanged(self):
  old=read(BASE/'behavior_pack/entities/player.json')['minecraft:entity'];new=read(BP/'entities/player.json')['minecraft:entity']
  # Native behavior is retained; only Rbow's reviewed sensor/groups/events are added.
  for k,v in old['components'].items():
   if k=='minecraft:environment_sensor':self.assertIn(v['triggers'],new['components'][k]['triggers'])
   else:self.assertEqual(v,new['components'][k])
  for k,v in old['component_groups'].items():self.assertEqual(v,new['component_groups'][k])
  for k,v in old['events'].items():
   if k.startswith('minecraft:'):self.assertEqual(v,new['events'][k])
 def test_pack_ids_stay_stable_and_versions_match(self):
  for folder in [BP,RP]:
   old=read(BASE/folder.name/'manifest.json');new=read(folder/'manifest.json');self.assertEqual(new['header']['uuid'],old['header']['uuid']);self.assertEqual(new['header']['version'],VERSION);self.assertEqual(new['header']['min_engine_version'],[1,26,40])
   self.assertTrue(all(m['version']==VERSION for m in new['modules']))
 def test_dependency_pack_uuid_exists(self):
  manifests=[read(ROOT/f/'manifest.json') for f in ['behavior_pack','resource_pack','rbow_behavior_pack','rbow_resource_pack']]
  versions={m['header']['uuid']:m['header']['version'] for m in manifests}
  for m in manifests:
   for dep in m.get('dependencies',[]):
    if 'uuid' in dep:self.assertIn(dep['uuid'],versions);self.assertEqual(dep['version'],versions[dep['uuid']])
 def test_model_and_paw_textures_are_real_128_atlases(self):
  for p in PETS:
   for filename in ['coat','paws']:
    with Image.open(RP/f'textures/entity/pets/{p["id"]}/{filename}.png') as im:self.assertEqual(im.size,(128,128));self.assertEqual(im.mode,'RGBA')
 def test_all_geometry_uv_coordinates_in_bounds(self):
  for name,g in GEOMETRIES.items():
   w=g['description'].get('texture_width',64);h=g['description'].get('texture_height',64)
   for b in g['bones']:
    for c in b.get('cubes',[]):
     self.assertTrue(all(x>0 for x in c['size']),(name,b['name']))
     for uv in c['uv'].values():
      x,y=uv['uv'];uw,vh=uv['uv_size'];self.assertGreaterEqual(min(x,x+uw),0);self.assertGreaterEqual(min(y,y+vh),0);self.assertLessEqual(max(x,x+uw),w);self.assertLessEqual(max(y,y+vh),h)
 def test_custom_animation_references_resolve(self):
  for alias,ref in PLAYER['animations'].items():
   if ref.startswith('animation.pet.'):self.assertIn(ref,ANIMS,alias)
   if ref.startswith('controller.animation.pet.'):self.assertIn(ref,CONTROLLERS,alias)
  for n,c in CONTROLLERS.items():
   self.assertIn(c['initial_state'],c['states'])
   for state in c['states'].values():
    for entry in state.get('animations',[]):
     for alias in ([entry] if isinstance(entry,str) else entry):self.assertIn(alias,PLAYER['animations'],(n,alias))
    for transition in state.get('transitions',[]):
     for target in transition:self.assertIn(target,c['states'])
 def test_all_animated_bones_exist_in_pet_or_native_rig(self):
  for p in PETS:
   bones={b['name'].lower() for b in GEOMETRIES[f'geometry.pet.{p["id"]}']['bones']}
   for name,a in ANIMS.items():
    if name.startswith(f'animation.pet.{p["id"]}.'):
     for b in a['bones']:self.assertIn(b.lower(),bones,(name,b))
 def test_player_geometry_and_texture_aliases_resolve(self):
  for alias,g in PLAYER['geometry'].items():
   if g.startswith('geometry.pet.'):self.assertIn(g,GEOMETRIES)
  for alias,t in PLAYER['textures'].items():
   if t.startswith(('textures/entity/pets/','textures/ui/pets/')):self.assertTrue((RP/(t+'.png')).exists(),t)
 def test_render_aliases_match_their_client_entity(self):
  for f in (RP/'entity').glob('*.json'):
   d=read(f)['minecraft:client_entity']['description']
   for r in d.get('render_controllers',[]):
    for name in ([r] if isinstance(r,str) else r):
     if name not in RENDERS:continue # Native renderer, supplied by the engine.
     text=json.dumps(RENDERS[name])
     for kind,alias in re.findall(r'\b(Geometry|Texture|Material)\.([A-Za-z0-9_]+)',text):
      self.assertIn(alias,d[{'Geometry':'geometry','Texture':'textures','Material':'materials'}[kind]],(f.name,name,kind,alias))
 def test_carter_visible_geometry_preserved_except_semantic_prefix(self):
  old=read(BASE/'resource_pack/models/entity/carter.geo.json')['minecraft:geometry'][0];new=GEOMETRIES['geometry.pet.carter']
  legacy=[mapped(b,lambda v:v.replace('cav_','pet_')) for b in old['bones'] if b['name'].startswith('cav_')]
  self.assertEqual(legacy,[b for b in new['bones'] if b['name'].startswith('pet_') and b['name'] not in {'pet_tool_mount','pet_shield_left','pet_shield_right'}])
 def test_carter_texture_byte_identical(self):
  self.assertEqual((BASE/'resource_pack/textures/entity/carter/blenheim.png').read_bytes(),(RP/'textures/entity/pets/carter/coat.png').read_bytes())
 def test_carter_ground_animation_channels_and_timing_preserved(self):
  old=read(BASE/'resource_pack/animations/carter.animation.json')['animations']
  for name in ['walk','run','idle','sneak','sneak_walk','air','secondary','look']:
   before=mapped(old['animation.pet.'+name],lambda v:v.replace('cav_','pet_'));after=ANIMS[f'animation.pet.carter.{name}']
   self.assertEqual({k:v for k,v in before.items() if k!='bones'},{k:v for k,v in after.items() if k!='bones'})
   for bone,channels in before['bones'].items():
    if bone.startswith('pet_'):self.assertEqual(channels,after['bones'][bone],(name,bone))
 def test_carter_first_person_geometry_and_pixels_preserved(self):
  old=read(BASE/'resource_pack/models/entity/first_person_paws.geo.json')['minecraft:geometry'][0]
  new=GEOMETRIES['geometry.pet.carter.paws'];self.assertEqual(old['bones'],new['bones'])
  self.assertEqual((BASE/'resource_pack/textures/entity/carter/first_person_paws.png').read_bytes(),(RP/'textures/entity/pets/carter/paws.png').read_bytes())
 def test_pet_default_hand_height_two_and_native_player_zero(self):
  self.assertEqual(read(BP/'entities/player.json')['minecraft:entity']['description']['properties']['pet:hand_height']['default'],0)
  for p in PETS:self.assertEqual(p['first_person']['default_hand_height'],2)
  expr=ANIMS['animation.pet.fp_lift']['bones']['rightArm']['position'][1];self.assertEqual(Expression(expr)(),2)
 def test_no_gameplay_engine_results_fabricated_in_build_metadata(self):
  info=read(ROOT/'BUILD_INFO.json');self.assertFalse(info['minecraft_client_tested']);self.assertFalse(info['realm_tested'])
 def test_archives_match_generated_folders(self):
  for folder,suffix in [(BP,'BP'),(RP,'RP')]:
   with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{VERSION_STR}_{suffix}.mcpack') as z:
    self.assertIsNone(z.testzip());self.assertEqual(set(z.namelist()),{p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()})
    for name in z.namelist():self.assertEqual(z.read(name),(folder/name).read_bytes())
  with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{VERSION_STR}.mcaddon') as z:self.assertEqual(len(z.namelist()),4)

class RenderingMathTests(unittest.TestCase):
 def test_compact_render_index_known_and_unknown_ids(self):
  for value,expected in [(0,0),(1,1),(2,2),(3,3),(4,0),(4095,0)]:self.assertEqual(INDEX({}, {'pet:model_id':value}),expected)
  self.assertEqual(INDEX(),0)
 def test_pet_activation_never_depends_on_viewer_or_skin(self):
  for n in [0,1,2,23]:self.assertEqual(bool(ACTIVE({}, {'pet:model_id':n})),n in [1,2])
 def test_third_person_gate(self):
  for n,fp,spectator,icon in product([0,1,2,999],[False,True],[False,True],[False,True]):
   result=TP({'variable.is_first_person':fp,'query.is_spectator':spectator,'variable.map_face_icon':icon},{'pet:model_id':n})
   self.assertEqual(bool(result),n in [1,2] and not fp and not spectator and not icon)
 def test_paws_gate(self):
  for n,fp,view in product([0,1,2,999],[False,True],['paws','native']):self.assertEqual(bool(PAWS({'variable.is_first_person':fp},{'pet:model_id':n,'pet:view':view})),n in [1,2] and fp and view=='paws')
 def test_all_persona_third_person_rules_hide_for_every_pet(self):
  for name,c in RENDERS.items():
   if name.startswith('controller.render.persona') and name.endswith('.third_person'):
    for row in c['part_visibility']:
     for expr in row.values():
      for n in [1,2]:self.assertFalse(Expression(expr)({'variable.helmet_layer_visible':1,'query.has_cape':1},{'pet:model_id':n}))
 def test_persona_human_rules_equivalent_to_original(self):
  original=read(ROOT/'upstream/persona.third_person.extracted.json')['render_controllers']
  for name,c in original.items():
   for old,new in zip(c['part_visibility'],RENDERS[name]['part_visibility']):
    for bone in old:
     for spectator in [False,True]:
      env={'query.is_spectator':spectator,'variable.helmet_layer_visible':1,'variable.chest_layer_visible':1,'variable.leg_layer_visible':1,'variable.boot_layer_visible':1,'query.has_cape':1}
      self.assertEqual(bool(Expression(old[bone])(env)),bool(Expression(new[bone])(env,{'pet:model_id':0})))
 def test_native_cape_hidden_for_all_pets_restored_human(self):
  rules=RENDERS['controller.render.player.cape']['part_visibility']
  for row in rules:
   for expr in row.values():
    for n in [1,2]:self.assertFalse(Expression(expr)({}, {'pet:model_id':n}))
  self.assertTrue(Expression(rules[-1]['cape'])({}, {'pet:model_id':0}))
 def test_empty_hand_lift_applies_only_to_first_person_pets(self):
  gate=Expression(next(s['pet_fp_lift'] for s in PLAYER['scripts']['animate'] if 'pet_fp_lift' in s))
  for n,fp,item in product([0,1,2,888],[False,True],['','diamond_pickaxe','filled_map']):self.assertEqual(bool(gate({'variable.is_first_person':fp,'item_mainhand':item},{'pet:model_id':n})),n in [1,2] and fp and item=='')
 def test_empty_hand_swap_guard_and_native_held_item_path(self):
  expr=Expression(ANIMS['animation.pet.fp_swap']['bones']['rightArm']['position'][1])
  for n,item,h in product([0,1,2],['','diamond_pickaxe','filled_map'],[0,.5,1]):
   result=expr({'variable.is_first_person':True,'item_mainhand':item,'variable.player_arm_height':h},{'pet:model_id':n})
   self.assertEqual(result,0 if n in [1,2] and item=='' else -10*(1-h))
 def test_native_root_controller_remains_running(self):
  self.assertEqual(PLAYER['scripts']['animate'][0],{'root':'1.0'});self.assertNotIn('pet_native_reset',PLAYER['animations'])
 def test_all_mouths_align_directly_without_native_hand_emulation(self):
  for p in PETS:
   setup_pet(p['id']);g=GEOMETRIES[f'geometry.pet.{p["id"]}'];tool=GEOMETRIES[f'geometry.pet.{p["id"]}.tool.pickaxe']
   mouth=np.array([*p['equipment']['mouth_sprite']['position'],1.])
   for pose,t,x,y in product(['neutral','walk','run','sneak','air','swim','crawl','ride','rest','attack'],[0,.25,.8],[-25,0,25],[-35,0,35]):
    u=sample.pose_updates(pose,t,attack=.6,look_x=x,look_y=y);a=sample.matrices(g['bones'],u);b=sample.matrices(tool['bones'],u)
    np.testing.assert_allclose(b['pet_tool_mount']@mouth,a['pet_head']@mouth,atol=1e-8)
 def test_pet_clips_never_write_native_companion_channels(self):
  for name,clip in ANIMS.items():
   if any(name.startswith(f'animation.pet.{p["id"]}.') for p in PETS):
    self.assertTrue(all(b.startswith('pet_') for b in clip['bones']),name)
 def test_first_person_native_aliases_unchanged(self):
  original=read(ROOT/'upstream/player.entity.json')['minecraft:client_entity']['description']['animations']
  for k,v in original.items():
   if k.startswith('first_person_') and k!='first_person_swap_item':self.assertEqual(PLAYER['animations'][k],v)

class EquipmentTests(unittest.TestCase):
 def test_materials_are_configuration(self):
  d=read(ROOT/'catalog/equipment/armor_materials.json');self.assertEqual(len(d['materials']),7);self.assertNotIn('MATERIALS=',(ROOT/'tools/equipment.py').read_text())
 def test_four_fit_geometries_per_pet(self):
  for p in PETS:
   for slot in ['helmet','chestplate','leggings','boots']:self.assertIn(f'geometry.pet.{p["id"]}.armor.{slot}',GEOMETRIES)
 def test_twenty_eight_player_only_adapters(self):
  paths=list((RP/'attachables').glob('*.player.json'));self.assertEqual(len(paths),28)
  for path in paths:
   d=read(path)['minecraft:attachable']['description'];self.assertEqual(set(d['item'].values()),{"query.owner_identifier == 'minecraft:player'"});self.assertTrue(d['identifier'].endswith('.player'))
 def test_native_and_fitted_render_routes_are_exclusive(self):
  for path in (RP/'attachables').glob('*.player.json'):
   d=read(path)['minecraft:attachable']['description']
   routes=d['render_controllers']
   self.assertEqual(len(routes),1+len(PETS))
   for i in range(len(PETS)+1):
    visible=[Expression(RENDERS[n]['part_visibility'][0]['*'])({'variable.pet_fit_index':i}) for n in routes]
    self.assertEqual(sum(bool(v) for v in visible),1)
    self.assertTrue(visible[i])
 def test_native_offset_runs_continuously_without_native_bones_in_pet_mesh(self):
  for path in (RP/'attachables').glob('*.player.json'):
   d=read(path)['minecraft:attachable']['description'];self.assertEqual(d['scripts']['animate'],['offset'])
   for p in PETS:
    g=GEOMETRIES[d['geometry']['pet_'+p['id']]]
    self.assertTrue(all(b['name'].startswith('pet_') for b in g['bones']))
 def test_fitted_routing_uses_wearer_not_viewer(self):
  d=read(RP/'attachables/iron_chestplate.player.json')['minecraft:attachable']['description'];text=d['scripts']['pre_animation'][0].split('=',1)[1].rstrip(';').replace('context.owning_entity->','owner.')
  f=Expression(text)
  for owner_id,viewer_id,fitted,first in product([0,1,2,3,99],[0,1,2,3],[False,True],[False,True]):
   result=f({'query.owner_identifier':'minecraft:player','owner.variable.pet_model_id':99,'variable.pet_model_id':viewer_id,'owner.variable.pet_armor_fit':not fitted,'owner.query.has_property':lambda k:True,'owner.query.property':lambda k:{'pet:model_id':owner_id,'pet:armor_fit':fitted}[k],'context.is_first_person':first})
   self.assertEqual(result,owner_id if fitted and not first and owner_id in [1,2,3] else 0)
 def test_nonplayer_armor_is_not_changed(self):
  d=read(RP/'attachables/iron_chestplate.player.json')['minecraft:attachable']['description'];self.assertFalse(Expression(next(iter(d['item'].values())))({'query.owner_identifier':'minecraft:armor_stand'}))
 def test_material_glint_dye_trim_paths_are_retained(self):
  c=RENDERS['controller.render.pet.armor_native'];self.assertEqual(c['textures'],['variable.has_trim ? variable.trim_path : Texture.default','Texture.enchanted']);self.assertEqual(c['materials'],[{'*':'variable.is_enchanted ? Material.enchanted : Material.default'}])
  leather=read(RP/'attachables/leather_chestplate.player.json')['minecraft:attachable']['description'];self.assertEqual(leather['materials'],{'default':'armor_leather','enchanted':'armor_leather_enchanted'})
 def test_fit_meshes_inherit_pet_bones_not_reconstructed_hand_rig(self):
  for p in PETS:
   for slot in ['helmet','chestplate','leggings','boots']:
    g=GEOMETRIES[f'geometry.pet.{p["id"]}.armor.{slot}']
    for bone in g['bones']:
     if bone.get('cubes'):self.assertTrue(bone['name'].startswith('pet_armor_'));self.assertTrue(bone['parent'].startswith('pet_'))
 def test_native_player_defaults_to_no_pet_armor_fit(self):
  prop=read(BP/'entities/player.json')['minecraft:entity']['description']['properties']['pet:armor_fit'];self.assertFalse(prop['default'])

if __name__=='__main__':unittest.main(verbosity=2)
