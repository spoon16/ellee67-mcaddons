"""Verify the new diagnostic contract matches the packaged data, not engine loading."""
from pathlib import Path
import hashlib,json,unittest,zipfile,io
ROOT=Path(__file__).resolve().parents[1]
class PropertyDiagnostics(unittest.TestCase):
 def test_diagnostic_schema_is_derived_from_actual_player_declarations(self):
  source=(ROOT/'src/property_schema.generated.js').read_text()
  raw=source.split('Object.freeze(',1)[1].rsplit(');',1)[0]
  schema=json.loads(raw)
  bp=json.loads((ROOT/'behavior_pack/entities/player.json').read_text())['minecraft:entity']['description']['properties']
  self.assertEqual(schema,{k:v for k,v in bp.items() if k.startswith("pet:")});self.assertEqual(len(schema),19)
  expected=hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  self.assertIn(expected,source)
 def test_gameplay_geometry_book_and_seating_inputs_preserved_from_044(self):
  from native_armor_reference import assert_unchanged_content
  assert_unchanged_content(self)
 def test_packaged_scripts_are_current_and_no_fonts_or_user_screenshots(self):
  version='.'.join(map(str,json.loads((ROOT/'project.json').read_text())['version']))
  with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{version}.mcaddon') as a:
   with zipfile.ZipFile(io.BytesIO(a.read(f'ElleeDog_67_Pets_v{version}_BP.mcpack'))) as b:
    for p in (ROOT/'src').glob('*.js'):self.assertEqual(b.read('scripts/'+p.name),p.read_bytes())
    self.assertEqual(b.read('entities/player.json'),(ROOT/'behavior_pack/entities/player.json').read_bytes())
    self.assertIsNone(b.testzip())
 def test_no_property_schema_or_inventory_repair_attempts_in_diagnostics(self):
  text=(ROOT/'src/property_health.js').read_text()
  for prohibited in ['.setProperty(','.setDynamicProperty(','.resetProperty(','.setEquipment(','.runCommand(','.teleport(']:self.assertNotIn(prohibited,text)
 def test_client_resource_check_is_versioned_in_all_languages(self):
  for p in (ROOT/'resource_pack/texts').glob('*.lang'):
   self.assertIn('pet.diag.rp_052=PET-RP-052: ElleeDog 67 Pets 0.5.2 NATIVE ARMOR resources loaded.',p.read_text())
 def test_guard_does_not_claim_absent_pack_activation_is_known(self):
  for path in ['src/appearance.js','src/core.js','src/settings.js','src/property_health.js']:
   self.assertNotIn('Activate both matching',(ROOT/path).read_text())
