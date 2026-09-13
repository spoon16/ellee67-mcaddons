"""1.1.5 removal, native-rendering, discovery and upgrade-recovery contracts.
These verify shipped files, not Bedrock's client or event timing.
"""
from pathlib import Path
import copy,hashlib,json,re,unittest,sys,subprocess,tempfile
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];BP=R/'behavior_pack';RP=R/'resource_pack'
def read(p):return json.loads(p.read_text())
BLOCKS={'rbow_ore','deepslate_rbow_ore','rbow_block'}
class NativeCleanup115(unittest.TestCase):
 def test_no_explosion_or_damage_interception(self):
  s='\n'.join(p.read_text() for p in (BP/'scripts').glob('*.js'))
  for term in ['beforeEvents.explosion','beforeEvents.entityHurt','afterEvents.entityHurt','isProtectedDamage','SAFE_CAUSES','spawnEntity(','.applyImpulse(','.runInterval(']:self.assertNotIn(term,s)
 def test_removed_pickup_modules_and_renderers_stay_removed(self):
  for p in read(R/'docs/v1.1.5_changes.json')['removed_runtime_and_generator_paths']:self.assertFalse((R/p).exists(),p)
  for p in read(R/'docs/v1.1.5_changes.json')['removed_texture_paths']:self.assertFalse((RP/'textures'/p).exists(),p)
 def test_runtime_drop_spawns_are_native(self):
  s='\n'.join(p.read_text() for p in (BP/'scripts').glob('*.js'))
  self.assertIn('spawnItem(',s);self.assertNotIn('spawnEntity(',s)
  self.assertNotIn('entitySpawn.subscribe',s);self.assertNotIn('isStackableWith',s)
 def test_legacy_type_is_recovery_only_not_a_living_pickup(self):
  entity=read(BP/'entities/rbow_drop.json')['minecraft:entity'];c=entity['components']
  self.assertFalse(entity['description']['is_spawnable']);self.assertFalse(entity['description']['is_summonable'])
  for key in ['minecraft:health','minecraft:damage_sensor','minecraft:attack','minecraft:fire_immune','minecraft:loot']:self.assertNotIn(key,c)
  self.assertEqual(c['minecraft:inventory']['inventory_size'],1);self.assertTrue(c['minecraft:inventory']['private'])
  self.assertFalse(c['minecraft:inventory']['can_be_siphoned_from']);self.assertIn('minecraft:persistent',c)
  g=read(RP/'models/entity/legacy_drop.geo.json')['minecraft:geometry'][0]
  for bone in g['bones']:self.assertNotIn('cubes',bone);self.assertNotIn('texture_meshes',bone)
 def test_migration_is_load_driven_not_a_live_item_scan(self):
  s=(BP/'scripts/legacy_drops.js').read_text();logic=(BP/'scripts/legacy_drop_logic.js').read_text()
  self.assertIn('afterEvents.entityLoad.subscribe',s);self.assertIn('afterEvents.worldLoad.subscribe',s)
  self.assertIn('getEntities({type:LEGACY_TYPE})',s);self.assertNotIn('runInterval',s)
  self.assertIn('stack.clone()',logic);self.assertNotIn('new ItemStack',logic)
  self.assertIn('inventory.setItem(0, undefined)',logic)
 def test_entry_point_and_runtime_graph_size(self):
  self.assertEqual((BP/'scripts/bootstrap.js').read_text(),"import './main.js';\nimport './legacy_drops.js';\n")
  self.assertEqual({p.stem for p in (BP/'scripts').glob('*.js')},{'bootstrap','main','rules','legacy_drop_logic','legacy_drops'})
 def test_all_three_blocks_use_native_cube_item_rendering(self):
  atlas=read(RP/'textures/item_texture.json')['texture_data']
  for n in BLOCKS:
   c=read(BP/f'items/{n}.json')['minecraft:item']['components']
   self.assertNotIn('minecraft:icon',c);self.assertNotIn('elleedog:'+n,atlas)
   self.assertEqual(c['minecraft:block_placer'],{'block':'elleedog:'+n,'replace_block_item':True})
   self.assertEqual(c['minecraft:max_stack_size'],64)
   b=read(BP/f'blocks/{n}.json')['minecraft:block']['components']
   self.assertEqual(b['minecraft:geometry'],'minecraft:geometry.full_block')
   for m in b['minecraft:material_instances'].values():self.assertEqual(m['render_method'],'opaque')
 def test_placed_native_blast_resistance_is_preserved(self):
  baseline=read(R/'docs/v1.1.4_runtime_baseline.json')['sha256']
  for p in (BP/'blocks').glob('*.json'):
   self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),baseline[p.relative_to(R).as_posix()])
   self.assertIs(read(p)['minecraft:block']['components']['minecraft:destructible_by_explosion'],False)
 def test_retired_mesh_paths_absent_and_native_reference_is_only_spear_attachable(self):
  c=read(BP/'items/rbow_spear.json')['minecraft:item']['components']
  self.assertTrue(c['minecraft:hand_equipped']['value']);self.assertIn('minecraft:piercing_weapon',c)
  self.assertFalse((RP/'attachables/rbow_spear.json').exists())
  self.assertFalse((RP/'attachables/rbow_spear_compact.json').exists())
  self.assertEqual({p.name for p in (RP/'attachables').glob('*spear*')},{'rbow_spear_native.json'})
  self.assertEqual(len(list((RP/'attachables').glob('*.json'))),9)
  for p in RP.rglob('*.json'):
   self.assertNotIn('texture_meshes',p.read_text())
   self.assertNotIn('rbow_pixels',p.read_text())

 def test_spear_stats_and_sprite_have_not_changed(self):
  baseline=read(R/'docs/v1.1.4_runtime_baseline.json')['sha256']
  for relative in ['behavior_pack/items/rbow_spear.json','resource_pack/textures/items/rbow_spear.png']:
   self.assertEqual(hashlib.sha256((R/relative).read_bytes()).hexdigest(),baseline[relative])
 def test_recipe_discovery_triggers_include_first_raw_ore_and_every_rbow_item(self):
  ids={read(p)['minecraft:item']['description']['identifier'] for p in (BP/'items').glob('*.json')}
  count=0
  for p in (BP/'recipes').glob('*.json'):
   j=read(p);kind=next(k for k in j if k.startswith('minecraft:recipe_'))
   if kind not in ['minecraft:recipe_shaped','minecraft:recipe_shapeless']:continue
   count+=1;rules=j[kind]['unlock'];self.assertEqual(len(rules),16)
   self.assertEqual({x['item'] for x in rules},ids);self.assertNotIn('AlwaysUnlocked',str(rules))
  self.assertEqual(count,14)
 def test_recipe_ingredients_outputs_and_identifiers_not_changed(self):
  baseline=read(R/'docs/v1.1.4_runtime_baseline.json')['sha256']
  # Normalized original recipes are supplied as fixtures for an exact semantic diff.
  original=read(R/'docs/v1.1.4_recipes.json')
  for p in (BP/'recipes').glob('*.json'):
   j=read(p);kind=next(k for k in j if k.startswith('minecraft:recipe_'))
   other=copy.deepcopy(original[p.name]);j[kind].pop('unlock',None);other[kind].pop('unlock',None)
   self.assertEqual(j,other,p.name)
 def test_no_rule_writes_or_synthetic_toast_workaround(self):
  s='\n'.join(p.read_text() for p in (BP/'scripts').glob('*.js'))
  self.assertNotRegex(s,r'gameRules\.\w+\s*=(?!=)')
  for token in ['setActionBar','setTitle','runCommand','ActionFormData','@minecraft/server-ui']:self.assertNotIn(token,s)
  self.assertIn('gameRules.recipesUnlock',s);self.assertIn('gameRules.showRecipeMessages',s)
 def test_native_trims_on_rbow_armor_kept(self):
  for part,slot in [('helmet','head'),('chestplate','chest'),('leggings','legs'),('boots','feet')]:
   c=read(BP/f'items/rbow_{part}.json')['minecraft:item']['components']
   self.assertIn('minecraft:trimmable_armors',c['minecraft:tags']['tags'])
   self.assertEqual(c['minecraft:wearable']['slot'],'slot.armor.'+slot)
   for suffix in ['', '.player']:
    d=read(RP/f'attachables/rbow_{part}{suffix}.json')['minecraft:attachable']['description']
    self.assertEqual(d['render_controllers'],['controller.render.armor'])
    self.assertEqual(d['textures']['default'],f'textures/models/armor/rbow_{2 if part=="leggings" else 1}')
 def test_no_return_of_workshop_or_material_support(self):
  for root in [BP,RP]:
   for p in root.rglob('*'):
    if p.suffix not in {'.js','.json'}:continue
    s=p.read_text()
    for token in ['@minecraft/server-ui','trim_station','ActionFormData','elleedog:rbow_trim','isSneaking','minecraft:smithing_table','minecraft:trim_materials','minecraft:transform_materials']:self.assertNotIn(token,s,str(p))
  self.assertFalse((BP/'entities/armor_stand.json').exists())
 def test_retained_art_and_armor_definitions_preserved_except_sleeve_endcap(self):
  baseline=read(R/'docs/v1.1.4_runtime_baseline.json')['sha256']
  paths=[*RP.joinpath('textures').rglob('*.png'),*[p for p in RP.joinpath('attachables').glob('*.json') if p.name!='rbow_spear_native.json'],BP/'entities/player.json',BP/'pack_icon.png',RP/'pack_icon.png']
  for p in paths:
   if p.relative_to(R).as_posix()=='resource_pack/textures/entity/rbow_spear_lab5.png':continue # New held image is checked exactly against Lab 5 in test_1110_native_spear.
   if p.relative_to(R).as_posix()=='resource_pack/textures/models/armor/rbow_1.png':continue # Exact 64-pixel delta checked in test_117_sleeves.
   self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),baseline[p.relative_to(R).as_posix()],str(p))
 def test_block_projection_is_solid_not_cut_out(self):
  for name in BLOCKS:
   im=Image.open(R/f'art/previews/block_projections/{name}.png').convert('RGBA')
   expected=Image.new('1',(32,32));ImageDraw.Draw(expected).polygon([(16,2),(30,9),(30,23),(16,30),(2,23),(2,9)],fill=1)
   for y in range(32):
    for x in range(32):self.assertEqual(im.getpixel((x,y))[3]>0,bool(expected.getpixel((x,y))))
 def test_current_status_does_not_claim_client_validation(self):
  s=read(R/'docs/v1.1.5_status.json')
  for k in ['engine_tests_run','client_render_tests_run','realm_tests_run']:self.assertEqual(s[k],0)
  self.assertFalse(s['dropped_item_explosion_protection']);self.assertFalse(s['custom_smithing_interaction'])
  self.assertTrue(s['native_trims_on_rbow_armor_configured'])
if __name__=='__main__':unittest.main()
