"""Mount kinds, baked seat trims and the seated pose: offline data and math checks, not a Minecraft client."""
from pathlib import Path
import json,sys,unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from seat_kinds import SEAT_KINDS
RP=ROOT/'resource_pack';BP=ROOT/'behavior_pack'
_,PETS,_=load_catalog(ROOT)

class SeatKinds(unittest.TestCase):
 def test_kind_list_only_grows_at_the_end(self):
  # The index is the wire value saved in pet:seat_kind and used by the client; the original five never move.
  self.assertEqual(SEAT_KINDS[:5],['none','boat','pig','stairs','other'])
  self.assertEqual(len(SEAT_KINDS),len(set(SEAT_KINDS)))
  for kind in SEAT_KINDS:self.assertRegex(kind,r'^[a-z][a-z_]*$')
  for kind in ['horse','strider','happy_ghast','cushion']:self.assertIn(kind,SEAT_KINDS)
 def test_seat_kind_property_range_covers_every_kind(self):
  for folder in [BP,ROOT/'rbow_behavior_pack']:
   prop=read(folder/'entities/player.json')['minecraft:entity']['description']['properties']['pet:seat_kind']
   self.assertEqual(prop,{'type':'int','range':[0,len(SEAT_KINDS)-1],'default':0,'client_sync':True})
  schema=json.loads((ROOT/'src/property_schema.generated.js').read_text().split('Object.freeze(',1)[1].rsplit(');',1)[0])
  self.assertEqual(schema['pet:seat_kind']['range'],[0,len(SEAT_KINDS)-1])
 def test_runtime_reads_the_same_kind_list(self):
  script=(ROOT/'src/catalog.generated.js').read_text()
  self.assertIn('export const SEAT_KINDS = Object.freeze('+json.dumps(SEAT_KINDS)+');',script)

if __name__=='__main__':unittest.main()
