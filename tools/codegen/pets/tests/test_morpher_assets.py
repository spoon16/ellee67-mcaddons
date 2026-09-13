"""Build-level validation of requested content. Does not emulate the Bedrock client."""
from pathlib import Path
import sys, json, unittest, hashlib
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
from equipment import generate
BP=ROOT/'behavior_pack';RP=ROOT/'resource_pack'
PROJECT,PETS,IDS=load_catalog(ROOT)
class MorpherAssets(unittest.TestCase):
 def test_named_forms_have_stable_ids_and_request_order(self):
  self.assertEqual([(p['id'],p['wire_id']) for p in PETS],[('carter',1),('mochi',2),('casper',3)])
 def test_owners_and_pet_kinds_are_exact(self):
  self.assertEqual([(p['owner'],p['pet_kind']) for p in PETS],[('ElleeDog','dog'),('warspoon17','cat'),('Casper201312','cat')])
 def test_casper_is_a_true_coat_variant_not_a_new_unverified_skeleton(self):
  c=PETS[2];m=PETS[1]
  self.assertEqual(c['variant_of'],'mochi');self.assertEqual(c['rig'],m['rig'])
  for key in ['model'] :self.assertEqual(c[key],m[key])
  self.assertEqual(c['first_person']['model'],m['first_person']['model']);self.assertEqual(c['equipment'],m['equipment'])
 def test_casper_exported_rig_matches_mochi(self):
  def bones(ident):return read(RP/f'models/entity/pets/{ident}/model.geo.json')['minecraft:geometry'][0]['bones']
  self.assertEqual(bones('casper'),bones('mochi'))
 def test_casper_motion_is_same_as_validated_cat_motion(self):
  def anim(ident):return {k.replace(ident,'PET'):v for k,v in read(RP/f'animations/pets/{ident}.animation.json')['animations'].items()}
  self.assertEqual(anim('casper'),anim('mochi'))
 def test_casper_white_fur_blue_eyes_pink_nose(self):
  with Image.open(ROOT/'assets/pets/casper/coat.png') as im:
   rgb=im.convert('RGBA');pixels=[tuple(map(int,p)) for p in np.asarray(rgb).reshape(-1,4)];colors={x[:3] for x in pixels if x[3]}
   self.assertIn((63,151,228),colors);self.assertIn((233,146,159),colors)
   white=sum(1 for r,g,b,a in pixels if a and min(r,g,b)>230)
   self.assertGreater(white,sum(1 for p in pixels if p[3])*.8)
   self.assertNotIn((39,42,45),colors)
 def test_casper_paws_are_white_with_pink_pads(self):
  with Image.open(ROOT/'assets/pets/casper/paws.png') as im:
   colors={v for v in [tuple(map(int,p)) for p in np.asarray(im.convert('RGBA')).reshape(-1,4)] if v[3]}
   self.assertTrue(any(min(v[:3])>230 for v in colors))
   self.assertTrue(any(v[0]>v[1]+25 and v[2]>v[1] for v in colors))
 def test_all_four_casper_armor_pieces_generated(self):
  for slot in ['helmet','chestplate','leggings','boots']:
   c=read(RP/f'models/entity/pets/casper/armor_{slot}.geo.json')['minecraft:geometry'][0]
   m=read(RP/f'models/entity/pets/mochi/armor_{slot}.geo.json')['minecraft:geometry'][0]
   self.assertEqual(c['bones'],m['bones'])
 def test_armored_player_selection_uses_wearer_and_supports_casper(self):
  d=read(RP/'attachables/iron_chestplate.player.json')['minecraft:attachable']['description']
  script=d['scripts']['pre_animation'][0].split('=',1)[1].rstrip(';').replace('context.owning_entity->','owner.')
  expression=Expression(script)
  for ident in [0,1,2,3,99]:
   for flag in [True,False]:
    result=expression({'query.owner_identifier':'minecraft:player','owner.query.has_property':lambda k:True,'owner.query.property':lambda k:{'pet:model_id':ident,'pet:armor_fit':flag}[k],'context.is_first_person':False})
    self.assertEqual(result,ident if ident in [1,2,3] and flag else 0)
 def test_initial_player_properties_are_native_not_pet_defaults(self):
  p=read(BP/'entities/player.json')['minecraft:entity']['description']['properties']
  expected={'pet:model_id':0,'pet:view':'native','pet:motion':False,'pet:armor_fit':False,'pet:gear_fit':False,'pet:hand_height':0,'pet:armor_lift':0.0,'pet:armor_scale':1.0}
  for key,value in expected.items():self.assertEqual(p[key]['default'],value)
  for pet in PETS:self.assertEqual(pet['first_person']['default_hand_height'],2)
 def test_book_has_correct_title_use_component_and_touch_button(self):
  d=read(BP/'items/morpher_book.json')['minecraft:item'];c=d['components']
  self.assertEqual(d['description']['identifier'],'pet:morpher_book')
  self.assertEqual(c['minecraft:max_stack_size'],1);self.assertIn('pet:open_morpher',c)
  self.assertEqual(c['minecraft:interact_button'],'Open Pet Morpher')
  self.assertEqual(c['minecraft:display_name']['value'],'item.pet:morpher_book.name')
 def test_book_is_not_food_placeable_throwable_or_a_vanilla_item_override(self):
  c=read(BP/'items/morpher_book.json')['minecraft:item']['components']
  self.assertFalse(set(c)&{'minecraft:food','minecraft:block_placer','minecraft:entity_placer','minecraft:throwable','minecraft:shooter','minecraft:durability'})
  for p in (BP/'items').glob('*.json'):self.assertFalse(read(p)['minecraft:item']['description']['identifier'].startswith('minecraft:'))
 def test_book_item_texture_and_sidecarry_texture_resolve_to_same_file(self):
  texture=read(RP/'textures/item_texture.json')['texture_data']['pet_morpher_book']['textures']
  entry=next(i for i in read(ROOT/'catalog/equipment/side_carry.json')['items'] if i['id']=='pet:morpher_book')
  self.assertEqual(entry['texture'],texture);self.assertTrue((RP/(texture+'.png')).is_file())
  with Image.open(RP/(texture+'.png')) as im:self.assertEqual(im.size,(128,128));self.assertEqual(im.mode,'RGBA')
 def test_morpher_translations_present_with_exact_title(self):
  for path in (RP/'texts').glob('*.lang'):
   text=path.read_text();self.assertIn('item.pet:morpher_book.name=ElleeDog 67 Pet Morpher',text)
   self.assertIn('pet.form.player=Player',text);self.assertIn('pet.form.casper=Casper',text)
 def test_choice_icons_including_player_and_casper_are_present(self):
  for name in ['player','carter','mochi','casper']:
   with Image.open(RP/f'textures/ui/pets/{name}.png') as im:self.assertEqual(im.width,im.height)
 def test_book_and_settings_commands_are_distinct(self):
  s=(BP/'scripts/main.js').read_text()
  self.assertRegex(s,r'reg\(["\']book["\']');self.assertRegex(s,r'reg\(["\']settings["\']');self.assertRegex(s,r'\(?p\)?\s*=>\s*morpher\.open\(p\)')
 def test_core_transform_module_never_edits_inventory_or_camera(self):
  s=(BP/'scripts/appearance.js').read_text()
  for method in ['.setEquipment(','.setItem(','.addItem(','.teleport(','.setCamera(','.addEffect(','.spawnEntity(']:self.assertNotIn(method,s)
 def test_legacy_human_remains_a_compatibility_alias_not_a_button(self):
  s=(BP/'scripts/morpher.js').read_text();self.assertRegex(s,r'label:\s*["\']Player["\']');self.assertNotRegex(s,r'label:\s*["\']Human["\']')
 def test_all_current_pack_ids_are_retained(self):
  previous=ROOT/'baseline/0.2.1'
  for folder in ['behavior_pack','resource_pack']:
   self.assertEqual(read(ROOT/folder/'manifest.json')['header']['uuid'],read(previous/folder/'manifest.json')['header']['uuid'])
if __name__=='__main__':unittest.main()
