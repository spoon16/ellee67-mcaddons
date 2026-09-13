"""Regression for the user's Actor property load error; not an engine emulator."""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import hashlib
import json
import sys
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from load_validation import (LoadValidationError,validate_property_definitions,
                             validate_event_literals,validate_recipe,validate_behavior_pack)
from catalog import read
PROJECT=read(ROOT/'project.json')
VERSION='.'.join(map(str,PROJECT['version']))
COMPANION='.'.join(map(str,PROJECT['integration']['companion_version']))
BP=ROOT/'behavior_pack';RB=ROOT/'rbow_behavior_pack';RP=ROOT/'resource_pack'

class TypedDefaults(unittest.TestCase):
 def spec(self):
  return {'pet:seat_lift':{'type':'float','range':[-64.0,64.0],'default':0.0,'client_sync':True}}
 def test_original_050_declaration_reproduces_validation_failure(self):
  bad=json.loads('{"pet:seat_lift":{"type":"float","range":[-64,64],"default":0,"client_sync":true}}')
  with self.assertRaisesRegex(LoadValidationError,'float default must be a JSON decimal'):
   validate_property_definitions(bad)
 def test_integer_zero_rejected_even_when_equal_to_float_zero(self):
  self.assertEqual(0,0.0)
  d=self.spec();d['pet:seat_lift']['default']=0
  with self.assertRaises(LoadValidationError):validate_property_definitions(d)
 def test_decimal_zero_survives_serialization(self):
  raw=json.dumps(self.spec());d=json.loads(raw)
  self.assertIs(type(d['pet:seat_lift']['default']),float)
  self.assertEqual(validate_property_definitions(d),1)
 def test_float_bounds_are_authored_as_decimals(self):
  d=self.spec();d['pet:seat_lift']['range']=[-64,64]
  with self.assertRaisesRegex(LoadValidationError,'range bounds'):validate_property_definitions(d)
 def test_float_default_bool_string_and_nonfinite_cases(self):
  for value in [True,None,float('nan'),float('inf')]:
   with self.subTest(value=value):
    d=self.spec();d['pet:seat_lift']['default']=value
    with self.assertRaises(LoadValidationError):validate_property_definitions(d)
 def test_integer_bool_and_float_defaults_are_distinct(self):
  for kind,value,range_ in [('int',True,[0,4]),('int',0.0,[0,4]),('bool',0,None),('bool',1.0,None)]:
   d={'p:x':{'type':kind,'default':value}}
   if range_:d['p:x']['range']=range_
   with self.subTest(kind=kind,value=value):
    with self.assertRaises(LoadValidationError):validate_property_definitions(d)
 def test_range_and_enum_failures(self):
  bads=[{'p:x':{'type':'float','range':[-1.0,1.0],'default':2.0}},
        {'p:x':{'type':'int','range':[3,0],'default':1}},
        {'p:x':{'type':'enum','values':['a'],'default':0}},
        {'p:x':{'type':'bool'}}]
  for d in bads:
   with self.subTest(d=d):
    with self.assertRaises(LoadValidationError):validate_property_definitions(d)
 def test_expression_default_not_confused_with_direct_value(self):
  d=self.spec();d['pet:seat_lift']['default']='0.0'
  validate_property_definitions(d)
 def test_both_shipped_player_properties_have_decimal_literals(self):
  for folder in [BP,RB]:
   d=read(folder/'entities/player.json')['minecraft:entity']['description']['properties']
   validate_property_definitions(d)
   self.assertEqual(len(d),20)
   self.assertIs(type(d['pet:seat_lift']['default']),float)
   self.assertTrue(all(type(x) is float for x in d['pet:seat_lift']['range']))
 def test_all_shipped_float_event_resets_use_float_literals(self):
  for folder in [BP,RB]:
   e=read(folder/'entities/player.json')['minecraft:entity']
   validate_event_literals(e['events'],e['description']['properties'])
   for name in ['pet:become_carter','pet:become_human']:
    self.assertIs(type(e['events'][name]['set_property']['pet:seat_lift']),float)
 def test_invalid_float_event_reset_is_rejected(self):
  with self.assertRaises(LoadValidationError):
   validate_event_literals({'set_property':{'pet:seat_lift':0}},self.spec())
 def test_validator_checks_written_packs_not_only_python_inputs(self):
  for folder in [BP,RB]:self.assertGreater(validate_behavior_pack(folder)['properties'],0)
  source=(ROOT/'tools/build.py').read_text()
  self.assertLess(source.index('validate_behavior_pack(folder)'),source.index('pack_files=['))
 def test_nested_installer_cannot_reintroduce_bad_zero(self):
  docs=[]
  with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{VERSION}.mcaddon') as outer:
   for name in [f'ElleeDog_67_Pets_v{VERSION}_BP.mcpack',f'67_Rbow_Ore_Mod_v{COMPANION}_Pets_BP.mcpack']:
    with zipfile.ZipFile(BytesIO(outer.read(name))) as pack:
     raw=pack.read('entities/player.json');docs.append(raw)
     definitions=json.loads(raw)['minecraft:entity']['description']['properties']
     self.assertIs(type(definitions['pet:seat_lift']['default']),float)
     validate_property_definitions(definitions)
  self.assertEqual(docs[0],docs[1])
 def test_all_old_property_names_values_and_rbow_mechanics_preserved(self):
  # Old snapshot deliberately keeps the invalid 0 as regression evidence.
  old=read(ROOT/'integration/pets_045_player.json')['minecraft:entity']['description']['properties']
  now=read(BP/'entities/player.json')['minecraft:entity']['description']['properties']
  # pet:armor_lift and pet:armor_scale were added for fitted-armor calibration; every older property is unchanged.
  self.assertEqual({k:v for k,v in now.items() if k.startswith('pet:') and k not in ('pet:armor_lift','pet:armor_scale')},old)
  self.assertEqual(now['pet:armor_lift'],{'type':'float','range':[-16.0,16.0],'default':0.0,'client_sync':True})
  self.assertEqual(now['pet:armor_scale'],{'type':'float','range':[0.5,1.5],'default':1.0,'client_sync':True})
  self.assertIs(type(old['pet:seat_lift']['default']),int)
  self.assertIs(type(now['pet:seat_lift']['default']),float)

class RecipeAndSpearDefaults(unittest.TestCase):
 def test_paw_recipe_unlock_added_without_changing_ingredients_or_result(self):
  old=read(ROOT/'baseline/0.2.1/behavior_pack/recipes/paw_token.json')
  new=read(BP/'recipes/paw_token.json')
  self.assertEqual(new['minecraft:recipe_shapeless'].pop('unlock'),[{'item':'minecraft:bone'}])
  self.assertEqual(old,new)
 def test_old_paw_recipe_fails_new_validation(self):
  with self.assertRaisesRegex(LoadValidationError,'unlock'):
   validate_recipe(read(ROOT/'baseline/0.2.1/behavior_pack/recipes/paw_token.json'))
 def test_both_behavior_pack_recipe_sets_pass(self):
  for folder in [BP,RB]:
   for f in (folder/'recipes').glob('*.json'):validate_recipe(read(f),str(f))
 def test_spear_flag_has_starting_value_but_is_not_forced_false_each_frame(self):
  d=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
  self.assertIn('variable.melee_spear_equipped = 0.0;',d['scripts']['initialize'])
  self.assertNotIn('variable.melee_spear_equipped = 0.0;',d['scripts']['pre_animation'])
  self.assertIn('controller.animation.player.root',d['animations'].values())
 def test_neither_fix_changes_player_inventory_mechanics(self):
  before=read(ROOT/'integration/rbow_1.2.0/behavior_pack/entities/player.json')['minecraft:entity']
  now=read(BP/'entities/player.json')['minecraft:entity']
  self.assertEqual(before['components'],now['components'])
  for k,v in before['events'].items():self.assertEqual(now['events'][k],v)

if __name__=='__main__':unittest.main()
