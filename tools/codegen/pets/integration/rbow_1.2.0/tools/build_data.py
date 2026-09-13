#!/usr/bin/env python3
"""Generate the reviewable Bedrock data files. Runtime JS is maintained separately."""
from pathlib import Path
import json, random, struct
ROOT=Path(__file__).resolve().parents[1]
BP=ROOT/'behavior_pack';RP=ROOT/'resource_pack'
RELEASE=json.loads((ROOT/'release.json').read_text())
VERSION=RELEASE['version']; ENGINE=RELEASE['min_engine_version']; NS='elleedog:'
VERSION_TEXT='.'.join(map(str,VERSION))
SULFUR_CUBE_TAG=RELEASE['sulfur_cube_item_tag']
UUID={'bp':'ea58ca29-f4bb-4cc7-8d8c-3d7e0a39c867','data':'692bd627-d4b9-49cf-9d97-9a575f15a2a5','script':'1356e30e-56ec-41c1-9a26-1a0714464e43','rp':'898ad9f2-55bc-4347-aa25-9079c12c8cb9','resource':'6cae9868-30da-4771-865d-52fe0ef0687f'}
def put(path,obj):
 p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
def feature(name,kind,**attrs):put(f'behavior_pack/features/{name}.json',{'format_version':'1.13.0',kind:{'description':{'identifier':NS+name},**attrs}})
def desc(name,ident):
 description = (
  f'{VERSION_TEXT}: Rbow ores, tools, armor, crafting and world generation. Sulfur cubes accept Rbow blocks and ores. Ellee Schoonover | ellee@ellee.com.'
  if ident=='bp' else
  f'{VERSION_TEXT}: Vibrant Rbow item and block textures, worn armor, standard armor trims and native spear rendering. Ellee Schoonover | ellee@ellee.com.'
 )
 return {'name':name,'description':description,'uuid':UUID[ident],'version':VERSION,'min_engine_version':ENGINE}

meta={'authors':['Ellee Schoonover — ellee@ellee.com'],'license':'See LICENSE and THIRD_PARTY_NOTICES.md'}
put('behavior_pack/manifest.json',{'format_version':2,'header':desc('67 Rbow Ore Mod — Behavior','bp'),'modules':[{'type':'data','uuid':UUID['data'],'version':VERSION},{'type':'script','language':'javascript','uuid':UUID['script'],'version':VERSION,'entry':'scripts/bootstrap.js'}],'dependencies':[{'uuid':UUID['rp'],'version':VERSION},{'module_name':'@minecraft/server','version':'2.9.0'}],'metadata':meta})
put('resource_pack/manifest.json',{'format_version':2,'header':desc('67 Rbow Ore Mod — Resources','rp'),'modules':[{'type':'resources','uuid':UUID['resource'],'version':VERSION}],'metadata':meta})
NAMES={'rbow_ore':'Rbow Ore','deepslate_rbow_ore':'Deepslate Rbow Ore','rbow_block':'Rbow Block','raw_rbow_ore':'Raw Rbow Ore','rbow_ingot':'Rbow Ingot','rbow_nug':'Rbow Nug'}
for kind in ['sword','pickaxe','axe','shovel','hoe','spear','helmet','chestplate','leggings','boots']:NAMES['rbow_'+kind]='Rbow '+kind.capitalize()
BLOCKS=['rbow_ore','deepslate_rbow_ore','rbow_block']
ARMOR={'helmet':(407,3,'head'),'chestplate':(592,8,'chest'),'leggings':(555,6,'legs'),'boots':(481,3,'feet')}
# These configured maxima are checked against native gear by the optional
# in-game diagnostics. The spear follows Mojang's 26.40 sample verbatim.
TOOLS={'sword':(2032,8,'sword'),'pickaxe':(2032,6,'pickaxe'),'axe':(2032,7,'axe'),'shovel':(2032,5,'shovel'),'hoe':(2032,0,'hoe')}
for name,label in NAMES.items():
 c={'minecraft:display_name':{'value':f'item.{NS}{name}.name'},'minecraft:fire_resistant':{'value':True},'minecraft:max_stack_size':64}
 if name not in BLOCKS:c['minecraft:icon']={'textures':{'default':NS+name}}
 if name in BLOCKS:
  c['minecraft:block_placer']={'block':NS+name,'replace_block_item':True}
  # Native sulfur-cube feeding, temptation, pickup and archetype selection all
  # use ITEM tags. Keep the real block item: the mob's held-item renderer shows
  # its existing block geometry. No mob override, script or proxy item required.
  c['minecraft:tags']={'tags':[SULFUR_CUBE_TAG]}
 kind=name.removeprefix('rbow_')
 if kind in TOOLS or kind in ARMOR:
  c['minecraft:max_stack_size']=1
  durability=TOOLS[kind][0] if kind in TOOLS else ARMOR[kind][0]
  c['minecraft:durability']={'max_durability':durability}
  c['minecraft:repairable']={'repair_items':[{'items':[NS+name],'repair_amount':'context.other->query.remaining_durability + 0.05 * query.max_durability'},{'items':[NS+'rbow_ingot'],'repair_amount':'query.max_durability * 0.25'}]}
  c['minecraft:tags']={'tags':['elleedog:rbow','minecraft:netherite_tier']}
  if kind in TOOLS:
   c['minecraft:hand_equipped']=True
   c['minecraft:damage']={'value':TOOLS[kind][1]}
   c['minecraft:tags']['tags']+=['minecraft:is_tool','minecraft:is_'+kind]
   c['minecraft:enchantable']={'slot':kind,'value':15}
   c['elleedog:rbow_tool']={}
   tags={'pickaxe':['stone','metal','rail','minecraft:is_pickaxe_item_destructible'], 'axe':['wood','log','plant','minecraft:is_axe_item_destructible'], 'shovel':['dirt','sand','gravel','snow','clay','minecraft:is_shovel_item_destructible'], 'hoe':['leaves','plant','minecraft:is_hoe_item_destructible'], 'sword':['web','plant']}[kind]
   speeds=[{'block':{'tags':'q.any_tag('+', '.join(repr(t) for t in tags)+')'},'speed':9 if kind!='sword' else 1}]
   # Explicit families supplement vanilla block tags, which are not uniform.
   explicit={
    'pickaxe':['stone','deepslate','cobblestone','cobbled_deepslate','obsidian','crying_obsidian','andesite','granite','diorite','tuff','basalt','blackstone','calcite','end_stone','netherrack','coal_ore','iron_ore','copper_ore','gold_ore','diamond_ore','emerald_ore','lapis_ore','redstone_ore','lit_redstone_ore','deepslate_coal_ore','deepslate_iron_ore','deepslate_copper_ore','deepslate_gold_ore','deepslate_diamond_ore','deepslate_emerald_ore','deepslate_lapis_ore','deepslate_redstone_ore','lit_deepslate_redstone_ore','nether_gold_ore','quartz_ore','ancient_debris'],
    'shovel':['dirt','grass_block','coarse_dirt','dirt_with_roots','podzol','mycelium','sand','red_sand','gravel','clay','mud','snow','snow_layer','soul_sand','soul_soil'],
    'hoe':['hay_block','sponge','wet_sponge','nether_wart_block','warped_wart_block','dried_kelp_block','target','moss_block','sculk','sculk_catalyst','sculk_sensor','sculk_shrieker'],
    'axe':[], 'sword':['web']}
   for block in explicit[kind]:speeds.append({'block':'minecraft:'+block,'speed':15 if kind=='sword' else 9})
   if kind=='pickaxe':speeds.extend({'block':NS+b,'speed':9} for b in BLOCKS)
   c['minecraft:digger']={'use_efficiency':True,'destroy_speeds':speeds}
  else:
   d,protect,slot=ARMOR[kind]
   c['minecraft:wearable']={'slot':'slot.armor.'+slot,'protection':protect}
   c['minecraft:durability']['damage_chance']={'min':60,'max':100}
   c['minecraft:enchantable']={'slot':'armor_'+{'helmet':'head','chestplate':'torso','leggings':'legs','boots':'feet'}[kind],'value':15}
   c['minecraft:tags']['tags']+=['minecraft:is_armor','minecraft:trimmable_armors']
 if name=='rbow_spear':
  c.update({'minecraft:tags':{'tags':['elleedog:rbow','minecraft:netherite_tier','minecraft:is_spear']},'minecraft:max_stack_size':1,
   'minecraft:durability':{'max_durability':2030,'damage_chance':{'min':0,'max':100}},
   'minecraft:repairable':{'repair_items':[{'items':[NS+name],'repair_amount':'context.other->query.remaining_durability'},{'items':[NS+'rbow_ingot'],'repair_amount':'query.max_durability * 0.25'}]},
   'minecraft:enchantable':{'slot':'melee_spear','value':15},'minecraft:hand_equipped':{'value':True},
   'minecraft:use_modifiers':{'use_duration':72000,'emit_vibrations':False,'start_sound':'item.netherite_spear.use','movement_modifier':1.0},
   'minecraft:cooldown':{'category':'spear','duration':1.15,'type':'attack'},'minecraft:swing_duration':{'value':1.15},
   'minecraft:swing_sounds':{'attack_miss':'item.netherite_spear.attack_miss','attack_hit':'item.netherite_spear.attack_hit'},
   'minecraft:damage':{'value':5},
   'minecraft:piercing_weapon':{'reach':{'min':2.0,'max':4.5},'creative_reach':{'min':2.0,'max':7.5},'hitbox_margin':.25},
   'minecraft:kinetic_weapon':{'delay':8,'reach':{'min':2.0,'max':4.5},'creative_reach':{'min':2.0,'max':7.5},'hitbox_margin':.25,'damage_multiplier':1.2,'damage_conditions':{'max_duration':175,'min_relative_speed':4.6},'knockback_conditions':{'max_duration':110,'min_speed':5.1},'dismount_conditions':{'max_duration':50,'min_speed':9.0}}})
  # Native spear manages kinetic-attack wear; do not also consume durability
  # through the custom ordinary-tool attack hook.
 cat='equipment' if kind in TOOLS or kind in ARMOR or kind=='spear' else 'construction' if name=='rbow_block' else 'items'
 put(f'behavior_pack/items/{name}.json',{'format_version':'1.26.40' if kind=='spear' else '1.26.30','minecraft:item':{'description':{'identifier':NS+name,'menu_category':{'category':cat}},'components':c}})

put('behavior_pack/loot_tables/blocks/rbow_empty.json',{'pools':[]})
for name in BLOCKS:
 mats={'*':{'texture':name,'render_method':'opaque'}}
 if name=='rbow_block':mats['up']={'texture':'rbow_block_top','render_method':'opaque'}
 c={'minecraft:display_name':f'tile.{NS}{name}.name','minecraft:geometry':'minecraft:geometry.full_block','minecraft:material_instances':mats,
 'minecraft:destructible_by_mining':{'seconds_to_destroy':4.5 if name.startswith('deepslate') else 3.0},
 'minecraft:destructible_by_explosion':False,'minecraft:flammable':False,
 'minecraft:loot':'loot_tables/blocks/rbow_empty.json','minecraft:map_color':'#BB50DB',
 'minecraft:tags':['minecraft:stone','minecraft:metal','minecraft:diamond_pick_diggable','minecraft:iron_pick_diggable','minecraft:netherite_pick_diggable','elleedog:rbow']}
 put(f'behavior_pack/blocks/{name}.json',{'format_version':'1.26.40','minecraft:block':{'description':{'identifier':NS+name},'components':c}})
put('resource_pack/blocks.json',{'format_version':[1,1,0],**{NS+b:{'sound':'stone' if b!='rbow_block' else 'metal'} for b in BLOCKS}})
put('resource_pack/textures/item_texture.json',{'resource_pack_name':'67 Rbow Ore Mod','texture_name':'atlas.items','texture_data':{NS+name:{'textures':'textures/items/'+name} for name in NAMES if name not in BLOCKS}})
put('resource_pack/textures/terrain_texture.json',{'resource_pack_name':'67 Rbow Ore Mod','texture_name':'atlas.terrain','padding':8,'num_mip_levels':4,'texture_data':{name:{'textures':'textures/blocks/'+name} for name in BLOCKS+['rbow_block_top']}})
langs=['en_US','en_GB'];put('resource_pack/texts/languages.json',langs)
text=['pack.name=67 Rbow Ore Mod','pack.description=Rbow ore and equipment by Ellee Schoonover — ellee@ellee.com.']
for n,label in NAMES.items():
 text.append(f'item.{NS}{n}.name={label}')
 if n in BLOCKS:text.append(f'tile.{NS}{n}.name={label}')
for lang in langs:(RP/f'texts/{lang}.lang').write_text('\n'.join(text)+'\n')
# Standard trimmable Rbow armor. The engine resolves native trim patterns/materials.
# No synchronized wearer properties, custom overlays, or vanilla item overrides.
for kind in ARMOR:
 layer=2 if kind=='leggings' else 1
 variable={'helmet':'helmet','chestplate':'chest','leggings':'leg','boots':'boot'}[kind]
 for player in [False,True]:
  ident=NS+'rbow_'+kind
  d={'identifier':ident+('.player' if player else ''),
     'materials':{'default':'armor','enchanted':'armor_enchanted'},
     'textures':{'default':f'textures/models/armor/rbow_{layer}', 'enchanted':'textures/misc/enchanted_actor_glint'},
     'geometry':{'default':f'geometry.{"player" if player else "humanoid"}.armor.{kind}'},
     'scripts':{'parent_setup':f'v.{variable}_layer_visible = 0.0;'},
     'render_controllers':['controller.render.armor']}
  if player:
   d['scripts']['animate']=['offset']
   d['item']={ident:"q.owner_identifier == 'minecraft:player'"}
   d['animations']={'offset':f'animation.armor.{kind}.offset'}
  put(f'resource_pack/attachables/rbow_{kind}'+('.player' if player else '')+'.json',
      {'format_version':'1.20.60','minecraft:attachable':{'description':d}})
# All new drops use minecraft:item. This importer only recovers old saved 1.1.4
# inventories; it never creates a custom entity, intercepts damage or polls drops.
(BP/'scripts/bootstrap.js').write_text("import './main.js';\nimport './legacy_drops.js';\n")

# Native recipe discovery: any first Rbow item reveals the crafting family.
# Minecraft owns per-player unlock state and its toast; do not change game rules.
DISCOVERY=[{'item':NS+name} for name in NAMES]
# Recipes: new material only, no custom stick, no vanilla recipe overrides.
def shaped(name,pattern,key,result,count=1):put(f'behavior_pack/recipes/{name}.json',{'format_version':'1.20.10','minecraft:recipe_shaped':{'description':{'identifier':NS+name},'tags':['crafting_table'],'pattern':pattern,'key':{k:{'item':v} for k,v in key.items()},'result':{'item':result,'count':count},'unlock':DISCOVERY}})
def shapeless(name,ingredients,result,count=1):put(f'behavior_pack/recipes/{name}.json',{'format_version':'1.20.10','minecraft:recipe_shapeless':{'description':{'identifier':NS+name},'tags':['crafting_table'],'ingredients':[{'item':v} for v in ingredients],'result':{'item':result,'count':count},'unlock':DISCOVERY}})
patterns={'sword':['I','I','S'],'pickaxe':['III',' S ',' S '],'axe':['II','IS',' S'],'shovel':['I','S','S'],'hoe':['II',' S',' S'],'spear':['  I',' S ','S  '],'helmet':['III','I I'],'chestplate':['I I','III','III'],'leggings':['III','I I','I I'],'boots':['I I','I I']}
for kind,pattern in patterns.items():
 key={'I':NS+'rbow_ingot'}
 if any('S' in r for r in pattern):key['S']='minecraft:stick'
 shaped('rbow_'+kind,pattern,key,NS+'rbow_'+kind)
shaped('rbow_block',['III','III','III'],{'I':NS+'rbow_ingot'},NS+'rbow_block')
shapeless('rbow_ingots_from_block',[NS+'rbow_block'],NS+'rbow_ingot',9)
shapeless('rbow_nugs_from_ingot',[NS+'rbow_ingot'],NS+'rbow_nug',9)
shaped('rbow_ingot_from_nugs',['NNN','NNN','NNN'],{'N':NS+'rbow_nug'},NS+'rbow_ingot')
for ingredient in ['raw_rbow_ore','rbow_ore','deepslate_rbow_ore']:
 put(f'behavior_pack/recipes/smelt_{ingredient}.json',{'format_version':'1.20.10','minecraft:recipe_furnace':{'description':{'identifier':NS+'smelt_'+ingredient},'tags':['furnace','blast_furnace'],'input':NS+ingredient,'output':NS+'rbow_ingot'}})
for kind in patterns:put(f'behavior_pack/recipes/recycle_rbow_{kind}.json',{'format_version':'1.20.10','minecraft:recipe_furnace':{'description':{'identifier':NS+'recycle_rbow_'+kind},'tags':['furnace','blast_furnace'],'input':NS+'rbow_'+kind,'output':NS+'rbow_nug'}})

# Little-endian NBT encoder for Bedrock .mcstructure files. Omitted voxels use
# index -1: no air blocks are placed, so the host rock between nodes is retained.
def s(v):b=v.encode('utf8');return struct.pack('<H',len(b))+b
def payload(t,v):
 if t==3:return struct.pack('<i',v)
 if t==8:return s(v)
 if t==9:
  elem,values=v;return bytes([elem])+struct.pack('<i',len(values))+b''.join(payload(elem,a) for a in values)
 if t==10:return b''.join(bytes([k])+s(n)+payload(k,x) for n,(k,x) in v.items())+b'\x00'
 raise ValueError(t)
def nbt(c):return b'\x0a\x00\x00'+payload(10,c)
def make_shape(n,seed):
 rng=random.Random(seed);nodes={(1,1,1)}
 while len(nodes)<n:
  frontier=set()
  for x,y,z in nodes:
   for dx,dy,dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
    p=(x+dx,y+dy,z+dz)
    if all(0<=a<3 for a in p) and p not in nodes:frontier.add(p)
  nodes.add(rng.choice(sorted(frontier)))
 return nodes
shape_index=[]
for n in range(8,17):
 for variant in range(4):
  nodes=make_shape(n,67000+n*10+variant)
  shape_index.append({'count':n,'variant':variant,'coordinates':sorted(nodes)})
  for host in ['stone','deepslate']:
   name=f'rbow_vein_{host}_{n}_{variant}'
   block=NS+('deepslate_rbow_ore' if host=='deepslate' else 'rbow_ore')
   indices=[0 if (x,y,z) in nodes else -1 for x in range(3) for y in range(3) for z in range(3)]
   pal={'block_palette':(9,(10,[{'name':(8,block),'states':(10,{}),'version':(3,18599941)}])),'block_position_data':(10,{})}
   document={'format_version':(3,1),'size':(9,(3,[3,3,3])),'structure':(10,{'block_indices':(9,(9,[(3,indices),(3,[-1]*27)])),'entities':(9,(10,[])),'palette':(10,{'default':(10,pal)})}),'structure_world_origin':(9,(3,[0,0,0]))}
   p=BP/f'structures/elleedog/{name}.mcstructure';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(nbt(document))
   feature(name,'minecraft:structure_template_feature',structure_name=NS+name,adjustment_radius=0,facing_direction='random',constraints={'block_intersection':{'block_allowlist':['minecraft:'+host]}})
  feature(f'rbow_vein_{n}_{variant}','minecraft:aggregate_feature',features=[NS+f'rbow_vein_{host}_{n}_{variant}' for host in ['stone','deepslate']],early_out='first_success')
feature('rbow_vein','minecraft:weighted_random_feature',features=[[NS+f'rbow_vein_{n}_{v}',1] for n in range(8,17) for v in range(4)])
put('behavior_pack/feature_rules/rbow_ore_distribution.json',{'format_version':'1.13.0','minecraft:feature_rules':{'description':{'identifier':NS+'rbow_ore_distribution','places_feature':NS+'rbow_vein'},'conditions':{'placement_pass':'underground_pass','minecraft:biome_filter':[{'test':'has_biome_tag','operator':'==','value':'overworld'}]},'distribution':{'iterations':4,'coordinate_eval_order':'xzy','x':{'distribution':'uniform','extent':[0,15]},'z':{'distribution':'uniform','extent':[0,15]},'y':{'distribution':'uniform','extent':[-50,8]}}}})
put('docs/vein_templates.json',shape_index)
put('docs/build_settings.json',{'version':VERSION,'min_engine_version':ENGINE,'api':'2.9.0','uuid':UUID,'ore_y_range':[-50,10],'generation_attempts_per_chunk':4,'rarity_status':'redstone-like target; not empirically calibrated','structure_counts':[8,16],'item_names':NAMES,'armor':ARMOR,'tools':TOOLS})
# Test kit is deliberately opt-in and does not run from tick/load scripts.
p=BP/'functions/elleedog/rbow_test_kit.mcfunction';p.parent.mkdir(parents=True,exist_ok=True)
p.write_text('# Optional: execute only in a disposable cheats-enabled test world.\n'+ '\n'.join('give @s '+NS+n+(' 64' if n in ['rbow_ingot','rbow_nug','rbow_block','rbow_ore','deepslate_rbow_ore','raw_rbow_ore'] else ' 1') for n in NAMES)+'\n')
print('Generated',len(NAMES),'items,',len(BLOCKS),'blocks,',len(list((BP/'recipes').glob('*.json'))),'recipes, 72 exact-count structures.')
