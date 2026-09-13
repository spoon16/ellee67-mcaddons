import io,json,sys,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from pack_conflicts import compare,definitions
class ConflictAuditTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
 def pack(self,name,identifier):
  p=self.root/name;p.mkdir();(p/'player.json').write_text(json.dumps({'minecraft:client_entity':{'description':{'identifier':identifier}}}));return p
 def test_detects_player_overlap_without_modifying_inputs(self):
  a=self.pack('a','minecraft:player');b=self.pack('b','minecraft:player');original=(a/'player.json').read_bytes();r=compare(a,b);self.assertEqual(r['overlapping_definitions'][0]['key'],'client_entity:minecraft:player');self.assertFalse(r['merge_performed']);self.assertEqual((a/'player.json').read_bytes(),original)
 def test_different_definitions_do_not_overlap(self):
  self.assertEqual(compare(self.pack('a','pet:first'),self.pack('b','pet:second'))['overlapping_definitions'],[])
 def test_reads_nested_actual_mcaddon(self):
  entries,warnings=definitions(ROOT/'dist/ElleeDog_67_Pets_v0.5.2.mcaddon');self.assertIn('client_entity:minecraft:player',entries);self.assertIn('geometry:geometry.pet.mochi',entries);self.assertFalse(warnings)
 def test_invalid_json_is_reported_not_silently_dropped(self):
  p=self.pack('a','pet:one');(p/'invalid.json').write_text('{oops');entries,warnings=definitions(p);self.assertEqual(len(warnings),1)
 def test_duplicate_definitions_reported(self):
  a=self.pack('a','minecraft:player');(a/'duplicate.json').write_bytes((a/'player.json').read_bytes());b=self.pack('b','pet:other');r=compare(a,b);self.assertIn('client_entity:minecraft:player',r['left_duplicate_definitions'])
 def test_untrusted_archive_names_are_never_extracted(self):
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr('../should_not_exist.json',json.dumps({'render_controllers':{'controller.render.test':{}}}))
  p=self.root/'test.mcpack';p.write_bytes(b.getvalue());entries,warnings=definitions(p);self.assertIn('render_controllers:controller.render.test',entries);self.assertFalse((self.root.parent/'should_not_exist.json').exists())
