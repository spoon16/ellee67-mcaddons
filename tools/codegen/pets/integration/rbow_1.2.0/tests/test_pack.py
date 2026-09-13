"""Data, PNG, recipe and little-endian structure checks (not Minecraft integration)."""
from pathlib import Path
import copy, io, itertools, json, re, struct, unittest, uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];BP=ROOT/'behavior_pack';RP=ROOT/'resource_pack'
NS='elleedog:'
def read(p):return json.loads(p.read_text())
def items():return {j['minecraft:item']['description']['identifier']:j['minecraft:item'] for j in map(read,(BP/'items').glob('*.json'))}
def no_duplicate_keys(pairs):
 d={}
 for k,v in pairs:
  if k in d:raise AssertionError('Duplicate JSON key: '+k)
  d[k]=v
 return d
class NBTReader:
 def __init__(self,data):self.f=io.BytesIO(data)
 def take(self,n):
  b=self.f.read(n)
  if len(b)!=n:raise ValueError('Truncated NBT')
  return b
 def u8(self):return self.take(1)[0]
 def text(self):return self.take(struct.unpack('<H',self.take(2))[0]).decode('utf8')
 def value(self,t):
  if t==3:return struct.unpack('<i',self.take(4))[0]
  if t==8:return self.text()
  if t==9:
   subtype=self.u8();n=struct.unpack('<i',self.take(4))[0]
   if not 0<=n<=100000:raise ValueError('Invalid list count')
   return [self.value(subtype) for _ in range(n)]
  if t==10:
   out={}
   while (kind:=self.u8())!=0:
    name=self.text()
    if name in out:raise ValueError('Duplicate compound key')
    out[name]=self.value(kind)
   return out
  raise ValueError(f'Unexpected type {t}')
 def root(self):
  assert self.u8()==10;assert self.text()==''
  value=self.value(10);assert self.f.read()==b''
  return value

def normalized_pattern(recipe):
 grid=[[recipe['key'].get(c,{}).get('item','') for c in row] for row in recipe['pattern']]
 while grid and not any(grid[0]):grid.pop(0)
 while grid and not any(grid[-1]):grid.pop()
 while grid and not any(row[0] for row in grid):
  for row in grid:row.pop(0)
 while grid and not any(row[-1] for row in grid):
  for row in grid:row.pop()
 return min(tuple(tuple(row) for row in grid),tuple(tuple(reversed(row)) for row in grid))

class PackTests(unittest.TestCase):
 def test_all_json_parses_without_duplicate_keys(self):
  for pack in [BP,RP]:
   for p in pack.rglob('*.json'):
    with self.subTest(file=str(p.relative_to(ROOT))):json.loads(p.read_text(),object_pairs_hook=no_duplicate_keys)
 def test_manifests_ids_version_and_dependency(self):
  b=read(BP/'manifest.json');r=read(RP/'manifest.json');ids=[]
  for j in [b,r]:
   self.assertEqual(j['header']['version'],read(ROOT/'release.json')['version']);self.assertEqual(j['header']['min_engine_version'],[1,26,40])
   self.assertIn('67 Rbow Ore Mod',j['header']['name']);self.assertIn('Ellee Schoonover',str(j['metadata']))
   ids.append(j['header']['uuid']);ids.extend(m['uuid'] for m in j['modules'])
   self.assertNotIn('capabilities',j)
  self.assertEqual(len(ids),len(set(ids)))
  for ident in ids:uuid.UUID(ident)
  self.assertIn({'uuid':r['header']['uuid'],'version':read(ROOT/'release.json')['version']},b['dependencies'])
  self.assertIn({'module_name':'@minecraft/server','version':'2.9.0'},b['dependencies'])
  self.assertTrue((BP/next(m['entry'] for m in b['modules'] if m['type']=='script')).is_file())
 def test_all_item_ids_names_and_counts(self):
  data=items();self.assertEqual(len(data),16)
  self.assertEqual(len(list((BP/'blocks').glob('*.json'))),3)
  for p in [BP,RP]:
   for f in p.rglob('*'):
    self.assertNotRegex(f.name.lower(),r'rboe|rainbow')
    if f.suffix in ['.json','.lang','.mcfunction']:
     self.assertNotRegex(f.read_text().lower(),r'rboe|rainbow')
  for ident in data:self.assertRegex(ident,r'^elleedog:(?:deepslate_|raw_)?rbow_[a-z]+$')
  self.assertNotIn(NS+'rbow_stick',data)
 def test_item_fire_protection_and_block_item_replacement(self):
  for ident,item in items().items():
   c=item['components'];self.assertEqual(c['minecraft:fire_resistant'],{'value':True})
   if ident in [NS+'rbow_ore',NS+'deepslate_rbow_ore',NS+'rbow_block']:
    self.assertEqual(c['minecraft:block_placer'],{'block':ident,'replace_block_item':True});self.assertNotIn('minecraft:icon',c)
 def test_armor_numbers_and_repair_enchant_slots(self):
  data=items();expect={'helmet':(407,3,'head','head'),'chestplate':(592,8,'chest','torso'),'leggings':(555,6,'legs','legs'),'boots':(481,3,'feet','feet')}
  for kind,(d,p,slot,ench) in expect.items():
   c=data[NS+'rbow_'+kind]['components'];self.assertEqual(c['minecraft:durability']['max_durability'],d)
   self.assertEqual(c['minecraft:wearable']['protection'],p);self.assertEqual(c['minecraft:wearable']['slot'],'slot.armor.'+slot)
   self.assertEqual(c['minecraft:enchantable'],{'slot':'armor_'+ench,'value':15})
   self.assertEqual(c['minecraft:max_stack_size'],1)
   self.assertIn(NS+'rbow_ingot',str(c['minecraft:repairable']))
 def test_tool_numbers_and_components(self):
  data=items()
  for kind,extra in {'sword':8,'pickaxe':6,'axe':7,'shovel':5,'hoe':0}.items():
   c=data[NS+'rbow_'+kind]['components'];self.assertEqual(c['minecraft:durability']['max_durability'],2032)
   self.assertEqual(c['minecraft:damage']['value'],extra);self.assertTrue(c['minecraft:digger']['use_efficiency'])
   self.assertEqual(c['elleedog:rbow_tool'],{});self.assertIn('minecraft:netherite_tier',c['minecraft:tags']['tags'])
 def test_spear_uses_native_components_not_throwable_or_custom_attack(self):
  c=items()[NS+'rbow_spear']['components']
  self.assertNotIn('elleedog:rbow_tool',c);self.assertNotIn('minecraft:throwable',c)
  self.assertEqual(c['minecraft:durability']['max_durability'],2030)
  self.assertEqual(c['minecraft:piercing_weapon']['reach'],{'min':2.0,'max':4.5})
  self.assertEqual(c['minecraft:kinetic_weapon']['damage_multiplier'],1.2)
  self.assertEqual(c['minecraft:swing_duration']['value'],c['minecraft:cooldown']['duration'])
  self.assertEqual(c['minecraft:enchantable']['slot'],'melee_spear')
 def test_custom_blocks_fire_blast_and_empty_native_loot(self):
  for f in (BP/'blocks').glob('*.json'):
   c=read(f)['minecraft:block']['components'];self.assertIs(c['minecraft:flammable'],False)
   self.assertIs(c['minecraft:destructible_by_explosion'],False)
   self.assertGreater(c['minecraft:destructible_by_mining']['seconds_to_destroy'],0)
   self.assertEqual(read(BP/c['minecraft:loot']),{'pools':[]})
 def test_recipe_references_unlocks_and_no_pattern_collision(self):
  ids=items();seen=set();patterns={}
  paths=list((BP/'recipes').glob('*.json'));self.assertEqual(len(paths),27)
  for f in paths:
   j=read(f);typ=next(k for k in j if k.startswith('minecraft:recipe_'));r=j[typ];ident=r['description']['identifier']
   self.assertNotIn(ident,seen);seen.add(ident)
   for ident in re.findall(r'elleedog:[a-z_]+',json.dumps({k:v for k,v in r.items() if k!='description'})):
    self.assertIn(ident,ids)
   if typ=='minecraft:recipe_shaped':
    self.assertLessEqual(len(r['pattern']),3);self.assertEqual(len(set(map(len,r['pattern']))),1)
    for row in r['pattern']:
     self.assertLessEqual(len(row),3)
     for symbol in row:
      if symbol!=' ':self.assertIn(symbol,r['key'])
    pattern=normalized_pattern(r);self.assertNotIn(pattern,patterns,f'{f.name} conflicts with {patterns.get(pattern)}');patterns[pattern]=f.name
 def test_native_style_spear_recipe_and_material_conversion(self):
  r=read(BP/'recipes/rbow_spear.json')['minecraft:recipe_shaped'];self.assertEqual(r['pattern'],['  I',' S ','S  '])
  self.assertEqual(r['key']['I']['item'],NS+'rbow_ingot');self.assertEqual(r['key']['S']['item'],'minecraft:stick')
  self.assertEqual(read(BP/'recipes/rbow_nugs_from_ingot.json')['minecraft:recipe_shapeless']['result']['count'],9)
  self.assertEqual(read(BP/'recipes/rbow_ingots_from_block.json')['minecraft:recipe_shapeless']['result']['count'],9)
  for path in ['rbow_ingot_from_nugs','rbow_block']:
   r=read(BP/f'recipes/{path}.json')['minecraft:recipe_shaped'];self.assertEqual(sum(c!=' ' for row in r['pattern'] for c in row),9);self.assertEqual(r['result']['count'],1)
 def test_atlas_paths_exist(self):
  for name in ['item_texture','terrain_texture']:
   for entry in read(RP/f'textures/{name}.json')['texture_data'].values():self.assertTrue((RP/(entry['textures']+'.png')).is_file())
  for f in (BP/'items').glob('*.json'):
   c=read(f)['minecraft:item']['components']
   if 'minecraft:icon' in c:self.assertIn(c['minecraft:icon']['textures']['default'],read(RP/'textures/item_texture.json')['texture_data'])
 def test_pack_icons_use_uploaded_artwork(self):
  original=Image.open(ROOT/'art/original/ElleeDog_67_Rbow_Ore.png').convert('RGBA').resize((256,256),Image.Resampling.LANCZOS)
  for p in [BP,RP]:
   with Image.open(p/'pack_icon.png') as icon:self.assertEqual(icon.convert('RGBA').tobytes(),original.tobytes())
 def test_png_assets_and_transparency(self):
  pngs=list((RP/'textures').rglob('*.png'));self.assertEqual(len(pngs),20)
  for f in pngs:
   with Image.open(f) as im:
    im.load();self.assertIn(im.size,[(16,16),(32,32),(64,32),(128,64)])
    alpha=im.convert('RGBA').getchannel('A')
    if 'blocks' in f.parts:self.assertEqual(alpha.getextrema(),(255,255))
    elif f.name=='none.png':self.assertEqual(alpha.getextrema(),(0,0))
    else:self.assertEqual(alpha.getextrema(),(0,255))
 def test_locked_png_export_preserves_existing_icons(self):
  source=(ROOT/'tools/build_assets.py').read_text()
  # No re-sampling/repainting was requested. The current pipeline exports the
  # final PNG snapshots, not the obsolete pre-alignment painter.
  self.assertNotIn("art/references",source)
  self.assertNotIn("approved_concept.png",source)
  self.assertNotIn("Image.Resampling.BICUBIC",source)
  self.assertNotIn("Image.Resampling.BILINEAR",source)
  for name in ['rbow_hoe','rbow_spear','rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots']:
   im=Image.open(RP/f'textures/items/{name}.png').convert('RGBA')
   self.assertEqual(im.size,(32,32))
   self.assertGreater(sum(im.getpixel((x,y))[3]>0 for x in range(im.width) for y in range(im.height)),80)
 def test_sprite_edges_have_no_fringes_or_semitransparent_pixels(self):
  for f in (RP/'textures').rglob('*.png'):
   im=Image.open(f).convert('RGBA')
   for pixel in (im.getpixel((x,y)) for x in range(im.width) for y in range(im.height)):
    self.assertIn(pixel[3],(0,255),str(f))
    if pixel[3]==0:self.assertEqual(pixel,(0,0,0,0),str(f))
 def test_item_icons_use_native_blocks_or_pinned_sprites(self):
  atlas=read(RP/'textures/item_texture.json')['texture_data'];self.assertEqual(len(atlas),13)
  for ident,item in items().items():
   c=item['components']
   if 'minecraft:block_placer' in c:
    self.assertNotIn('minecraft:icon',c);self.assertEqual(c['minecraft:block_placer']['block'],ident)
   else:
    key=c['minecraft:icon']['textures']['default'];self.assertEqual(key,ident);self.assertIn(key,atlas)
    im=Image.open(RP/(atlas[key]['textures']+'.png')).convert('RGBA');self.assertEqual(im.getchannel('A').getextrema(),(0,255))

 def test_modern_block_parser_tags(self):
  for p in (BP/'blocks').glob('*.json'):
   j=read(p);c=j['minecraft:block']['components']
   self.assertEqual(j['format_version'],'1.26.40')
   self.assertFalse(any(k.startswith('tag:') for k in c))
   self.assertIsInstance(c['minecraft:tags'],list)
   for tag in c['minecraft:tags']:self.assertRegex(tag,r'^[a-z0-9_]+:[a-z0-9_]+$')
   self.assertIn('elleedog:rbow',c['minecraft:tags'])
 def test_standard_trims_enabled_without_overwriting_vanilla_materials(self):
  for kind in ['helmet','chestplate','leggings','boots']:
   c=items()[NS+'rbow_'+kind]['components']
   self.assertIn('minecraft:trimmable_armors',c['minecraft:tags']['tags'])
   d=read(RP/f'attachables/rbow_{kind}.json')
   self.assertEqual(d['format_version'],'1.20.60')
   self.assertEqual(d['minecraft:attachable']['description']['materials']['default'],'armor')
  # A tag alone is not a verified new native material registration. Do not
  # silently replace amethyst/redstone or advertise an unimplemented input.
  self.assertNotIn('minecraft:trim_materials',items()[NS+'rbow_ingot']['components'].get('minecraft:tags',{}).get('tags',[]))
  self.assertFalse((RP/'textures/trims/color_palettes').exists())
 def test_attachables_reference_matching_ids_and_real_textures(self):
  data=items();paths=list((RP/'attachables').glob('*.json'));self.assertEqual(len(paths),9)
  for f in paths:
   d=read(f)['minecraft:attachable']['description'];ident=d['identifier'].removesuffix('.player')
   if ident.startswith(NS):
    self.assertIn(ident,data);self.assertTrue((RP/(d['textures']['default']+'.png')).is_file())
   else:self.assertTrue(ident.startswith('minecraft:'))
   if ident.endswith('spear'):self.assertEqual(d['geometry']['default'],'geometry.spear')
   else:self.assertRegex(d['geometry']['default'],r'^geometry\.(?:humanoid|player)\.armor\.')
   for name,path in d['textures'].items():
    if name.startswith('rbow_'):self.assertTrue((RP/(path+'.png')).is_file())
 def test_localization_all_items_and_blocks_have_names(self):
  for lang in ['en_US','en_GB']:
   lines=(RP/f'texts/{lang}.lang').read_text().splitlines();table=dict(s.split('=',1) for s in lines if '=' in s)
   for ident in items():self.assertIn('item.'+ident+'.name',table)
   for f in (BP/'blocks').glob('*.json'):self.assertIn('tile.'+NS+f.stem+'.name',table)
   self.assertEqual(table['item.elleedog:rbow_nug.name'],'Rbow Nug')
 def test_all_72_structure_files_decode_and_have_exact_connected_counts(self):
  paths=list((BP/'structures/elleedog').glob('*.mcstructure'));self.assertEqual(len(paths),72)
  for f in paths:
   with self.subTest(structure=f.stem):
    n=int(f.stem.split('_')[-2]);s=NBTReader(f.read_bytes()).root();self.assertEqual(s['format_version'],1);self.assertEqual(s['size'],[3,3,3])
    indices=s['structure']['block_indices'];self.assertEqual(len(indices),2);self.assertEqual(len(indices[0]),27)
    self.assertEqual(indices[0].count(0),n);self.assertEqual(set(indices[0]),{-1,0});self.assertEqual(indices[1],[-1]*27)
    nodes={(i//9,(i//3)%3,i%3) for i,v in enumerate(indices[0]) if v==0}
    reached={next(iter(nodes))};frontier=list(reached)
    while frontier:
     x,y,z=frontier.pop()
     for dx,dy,dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
      p=(x+dx,y+dy,z+dz)
      if p in nodes and p not in reached:reached.add(p);frontier.append(p)
    self.assertEqual(reached,nodes)
    pal=s['structure']['palette']['default']['block_palette'];self.assertEqual(len(pal),1)
    self.assertEqual(pal[0]['name'],NS+('deepslate_rbow_ore' if 'deepslate' in f.stem else 'rbow_ore'))
    self.assertEqual(pal[0]['states'],{});self.assertEqual(s['structure']['entities'],[])
 def test_feature_graph_has_no_missing_references(self):
  features={NS+f.stem:read(f) for f in (BP/'features').glob('*.json')};self.assertEqual(len(features),109)
  for ident,j in features.items():
   typ=next(k for k in j if k.startswith('minecraft:'));f=j[typ];self.assertEqual(f['description']['identifier'],ident)
   if typ=='minecraft:structure_template_feature':
    self.assertTrue((BP/'structures/elleedog'/(f['structure_name'].split(':')[1]+'.mcstructure')).is_file())
    self.assertEqual(f['adjustment_radius'],0);self.assertEqual(f['facing_direction'],'random')
    self.assertIn(f['constraints']['block_intersection']['block_allowlist'],[['minecraft:stone'],['minecraft:deepslate']])
   else:
    refs=f['features'] if typ=='minecraft:aggregate_feature' else [x[0] for x in f['features']]
    for ref in refs:self.assertIn(ref,features)
    if typ=='minecraft:aggregate_feature':self.assertEqual(f['early_out'],'first_success')
 def test_world_generation_height_dimension_and_distribution(self):
  r=read(BP/'feature_rules/rbow_ore_distribution.json')['minecraft:feature_rules'];self.assertEqual(r['description']['places_feature'],NS+'rbow_vein')
  self.assertEqual(r['conditions']['placement_pass'],'underground_pass')
  self.assertEqual(r['conditions']['minecraft:biome_filter'][0]['value'],'overworld')
  d=r['distribution'];self.assertEqual(d['y']['extent'],[-50,8]);self.assertEqual(d['y']['extent'][1]+3-1,10)
  self.assertEqual(d['iterations'],4);self.assertEqual(d['x']['extent'],[0,15]);self.assertEqual(d['z']['extent'],[0,15])
  weights=read(BP/'features/rbow_vein.json')['minecraft:weighted_random_feature']['features'];self.assertEqual(len(weights),36);self.assertEqual({x[1] for x in weights},{1})
 def test_player_override_preserves_reference_except_explicit_armor_additions(self):
  base=read(ROOT/'art/references/player.vanilla.json');custom=read(BP/'entities/player.json');c=copy.deepcopy(custom['minecraft:entity'])
  del c['description']['properties']
  c['components']['minecraft:environment_sensor']['triggers']=c['components']['minecraft:environment_sensor']['triggers'][0]
  for section in ['component_groups','events']:
   c[section]={k:v for k,v in c[section].items() if not k.startswith(NS)}
  self.assertEqual(c,base['minecraft:entity']);self.assertEqual(custom['format_version'],base['format_version'])
 def test_all_sixteen_armor_states_have_exactly_one_sensor_result(self):
  e=read(BP/'entities/player.json')['minecraft:entity'];cases=e['components']['minecraft:environment_sensor']['triggers'][1:];self.assertEqual(len(cases),16)
  for bits in itertools.product([False,True],repeat=4):
   matches=[]
   for c in cases:
    f=c['filters']['all_of'][1:]
    if all(active==(test['operator']=='==') for active,test in zip(bits,f)):matches.append(c)
   self.assertEqual(len(matches),1);self.assertEqual(matches[0]['event'],f'elleedog:rbow_armor_{sum(bits)}')
  for n in range(5):
   key=f'elleedog:rbow_armor_{n}'
   self.assertEqual(e['component_groups'][key]['minecraft:knockback_resistance']['value'],n/10)
   self.assertEqual(e['events'][key]['set_property']['elleedog:rbow_armor_count'],n)
 def test_no_automatic_cheats_or_global_gameplay_commands(self):
  text='\n'.join(f.read_text() for f in (BP/'scripts').glob('*.js'))
  self.assertNotRegex(text,r'runCommand|system\.runJob|gamerule\s|give\s@|setGameMode')
  self.assertFalse((BP/'functions/tick.json').exists())
  kit=(BP/'functions/elleedog/rbow_test_kit.mcfunction').read_text()
  self.assertEqual(len([line for line in kit.splitlines() if line.startswith('give ')]),16)
 def test_only_declared_entities_are_overridden(self):
  self.assertEqual({p.name for p in (BP/'entities').glob('*.json')},{'player.json','rbow_drop.json'})
  self.assertFalse((RP/'entity/player.entity.json').exists())
 def test_literal_preview_atlas_has_sixteen_tiles(self):
  with Image.open(ROOT/'art/previews/sprite_atlas_128.png') as im:
   im.verify();self.assertEqual(im.size,(128,128))

if __name__=='__main__':unittest.main(verbosity=2)
