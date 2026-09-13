#!/usr/bin/env python3
"""Preserve the Mojang 26.40 player definition and add armor-only resistance.
The source baseline is reconstructed without semantic changes from the cited
Mojang sample. This player.json override is a documented compatibility boundary.
"""
from pathlib import Path
import json,itertools
ROOT=Path(__file__).resolve().parents[1]
components={
'minecraft:attack':{'damage':1},'minecraft:block_climber':{},
'minecraft:breathable':{'generates_bubbles':False,'inhale_time':3.75,'suffocate_time':-1,'total_supply':15},
'minecraft:can_climb':{},'minecraft:collision_box':{'height':1.8,'width':.6},'minecraft:conditional_bandwidth_optimization':{},
'minecraft:environment_sensor':{'triggers':{'event':'minecraft:gain_raid_omen','filters':{'all_of':[{'subject':'self','test':'has_mob_effect','value':'bad_omen'},{'subject':'self','test':'is_in_village','value':True}]}}},
'minecraft:exhaustion_values':{'sprint':.1,'jump':.05,'attack':.1,'damage':.1,'heal':6.,'lunge':4.,'sprint_jump':.2,'mine':.005,'swim':.01,'walk':0.},
'minecraft:experience_reward':{'on_death':'Math.Min(query.player_level * 7, 100)'},
'minecraft:hurt_on_condition':{'damage_conditions':[{'cause':'lava','damage_per_tick':4,'filters':{'operator':'==','test':'in_lava','subject':'self','value':True}}]},
'minecraft:insomnia':{'days_until_insomnia':3},'minecraft:is_hidden_when_invisible':{},
'minecraft:loot':{'table':'loot_tables/empty.json'},'minecraft:movement':{'value':.1},
'minecraft:nameable':{'allow_name_tag_renaming':False,'always_show':True},'minecraft:physics':{'push_towards_closest_space':True},
'minecraft:player.exhaustion':{'max':20,'value':0},'minecraft:player.experience':{'max':1,'value':0},
'minecraft:player.level':{'max':24791,'value':0},'minecraft:player.saturation':{'max':20,'value':5},'minecraft:pushable_by_block':{},
'minecraft:apply_knockback_rules':{'presets':[]},
'minecraft:rideable':{'family_types':['parrot_tame'],'pull_in_entities':True,'seat_count':2,'seats':[{'lock_rider_rotation':0,'min_rider_count':0,'max_rider_count':0,'position':[.4,-.2,-.1]},{'lock_rider_rotation':0,'min_rider_count':1,'max_rider_count':2,'position':[-.4,-.2,-.1]}]},
'minecraft:type_family':{'family':['player']}}
for name,h,v in [('bouncy',.165,.105),('regular',.165,.105),('slow_bouncy',.165,.24),('slow_flat',.165,.105),('fast_flat',.365,.09),('light',.165,.18),('fast_sliding',.265,.09),('slow_sliding',.165,.09),('sticky',.165,.09),('high_resistance',.165,.09),('explosive',.165,.09),('hot',.165,.105)]:
 components['minecraft:apply_knockback_rules']['presets'].append({'filter':{'test':'enum_property','subject':'other','domain':'minecraft:sulfur_cube_archetype','value':name},'horizontal_power':h,'vertical_power':v,'vertical_velocity_cap':8.,'slowdown_scale':1.,'scale_with_damage':True,'knockback_mode':'hit_direction','extra_knockback_approach':'multiply_reduced'})
groups={'minecraft:add_raid_omen':{'minecraft:spell_effects':{'add_effects':[{'display_on_screen_animation':True,'duration':30,'effect':'raid_omen'}],'remove_effects':'bad_omen'},'minecraft:timer':{'looping':False,'time':[0.,0.],'time_down_event':{'event':'minecraft:clear_add_raid_omen','target':'self'}}},'minecraft:clear_raid_omen_spell_effect':{'minecraft:spell_effects':{}},'minecraft:raid_trigger':{'minecraft:raid_trigger':{'triggered_event':{'event':'minecraft:remove_raid_trigger','target':'self'}}}}
events={'minecraft:clear_add_raid_omen':{'add':{'component_groups':['minecraft:clear_raid_omen_spell_effect']},'remove':{'component_groups':['minecraft:add_raid_omen']}},'minecraft:remove_raid_trigger':{'remove':{'component_groups':['minecraft:raid_trigger']}},'minecraft:gain_raid_omen':{'add':{'component_groups':['minecraft:add_raid_omen']}},'minecraft:trigger_raid':{'add':{'component_groups':['minecraft:raid_trigger']}}}
entity={'description':{'identifier':'minecraft:player','is_summonable':False,'is_spawnable':False,'spawn_category':'creature'},'components':components,'component_groups':groups,'events':events}
base={'format_version':'1.26.30','minecraft:entity':entity}
p=ROOT/'art/references/player.vanilla.json';p.write_text(json.dumps(base,indent=2)+'\n')
entity['description']['properties']={'elleedog:rbow_armor_count':{'type':'int','range':[0,4],'default':0,'client_sync':False}}
triggers=[components['minecraft:environment_sensor']['triggers']]
for bits in itertools.product([False,True],repeat=4):
 n=sum(bits)
 filters=[{'test':'int_property','domain':'elleedog:rbow_armor_count','operator':'!=','value':n}]
 for active,slot,piece in zip(bits,['head','torso','leg','feet'],['helmet','chestplate','leggings','boots']):
  filters.append({'test':'has_equipment','subject':'self','domain':slot,'operator':'==' if active else '!=','value':'elleedog:rbow_'+piece})
 triggers.append({'filters':{'all_of':filters},'event':f'elleedog:rbow_armor_{n}'})
components['minecraft:environment_sensor']['triggers']=triggers
for n in range(5):
 name=f'elleedog:rbow_armor_{n}'
 groups[name]={'minecraft:knockback_resistance':{'value':n/10}}
 events[name]={'set_property':{'elleedog:rbow_armor_count':n},'remove':{'component_groups':[f'elleedog:rbow_armor_{i}' for i in range(5)]},'add':{'component_groups':[name]}}
p=ROOT/'behavior_pack/entities/player.json';p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(base,indent=2)+'\n')
print('Added 16 armor-state sensor cases; preserved vanilla player behaviors.')
