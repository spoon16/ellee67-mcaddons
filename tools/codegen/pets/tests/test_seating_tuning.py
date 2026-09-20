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

class BakedTrims(unittest.TestCase):
 def fixture(self):
  import shutil,tempfile
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);target=Path(tmp.name)/'src'
  def ignore(source,names):
   omitted={'__pycache__'}
   if Path(source)==ROOT:omitted.update({'dist','previews','behavior_pack','resource_pack','rbow_behavior_pack','rbow_resource_pack'})
   return omitted.intersection(names)
  shutil.copytree(ROOT,target,ignore=ignore)
  return target
 def test_carter_bakes_the_measured_trims_and_the_cats_bake_nothing(self):
  by={p['id']:p['seating']['kinds'] for p in PETS}
  self.assertEqual({k:v['trim'] for k,v in by['carter'].items()},
   {'boat':0,'stairs':0,'pig':-2,'horse':4,'strider':1,'happy_ghast':3,'cushion':1,'other':0})
  for ident in ['mochi','casper']:self.assertEqual({k:v['trim'] for k,v in by[ident].items()},{k:0 for k in SEAT_KINDS[1:]})
 def test_every_pet_lists_every_kind_but_none_so_the_runtime_indexes_by_kind(self):
  for p in PETS:self.assertEqual(list(p['seating']['kinds']),SEAT_KINDS[1:])
 def test_generated_catalog_carries_the_profiles_and_a_bake_stamp(self):
  script=(ROOT/'src/catalog.generated.js').read_text()
  emitted=json.loads(script.split('export const PETS = Object.freeze(',1)[1].split('.map(p => Object.freeze(p)));',1)[0])
  self.assertEqual({p['id']:p['seating'] for p in emitted},{p['id']:p['seating'] for p in PETS})
  self.assertEqual(next(p for p in emitted if p['id']=='carter')['seating']['kinds']['happy_ghast'],{'trim':3})
  import re
  stamp=re.search(r'export const SEAT_TRIM_BAKE = "([0-9a-f]{16})";',script);self.assertIsNotNone(stamp)
  expected=__import__('hashlib').sha256(json.dumps({p['id']:p['seating'] for p in PETS},sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16]
  self.assertEqual(stamp.group(1),expected)
 def test_other_and_unknown_kinds_and_bad_numbers_are_rejected(self):
  from catalog import write,load_catalog,CatalogError
  for kinds in [{'other':{'trim':1}},{'none':{'trim':0}},{'sofa':{'trim':1}},{'pig':{'lift':1}},{'pig':{'trim':'2'}},{'pig':{'trim':99}},{'pig':{'trim':True}}]:
   r=self.fixture();path=r/'catalog/pets/mochi.json';d=read(path);d['seating']={'kinds':kinds};write(path,d)
   with self.assertRaises(CatalogError,msg=str(kinds)):load_catalog(r)
  r=self.fixture();path=r/'catalog/pets/mochi.json';d=read(path);d['seating']={'kinds':{'pig':{'trim':-1.5}},'note':'ok'};write(path,d)
  _,pets,_=load_catalog(r);mochi=next(p for p in pets if p['id']=='mochi')
  self.assertEqual(mochi['seating']['kinds']['pig'],{'trim':-1.5});self.assertEqual(mochi['seating']['note'],'ok')
  # A normalized block (every kind listed, "other" at zero) is accepted again, so a cloned pet loads.
  from seat_kinds import normalize_seating
  self.assertEqual(normalize_seating(mochi['seating'],'mochi'),mochi['seating'])
