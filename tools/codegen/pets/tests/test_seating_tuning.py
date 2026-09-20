"""Mount kinds, baked seat trims and the seated pose: offline data and math checks, not a Minecraft client."""
from pathlib import Path
import json,sys,unittest
import numpy as np
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
  self.assertEqual(next(p for p in emitted if p['id']=='carter')['seating']['kinds']['happy_ghast'],{'trim':3,'forward':0})
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
  self.assertEqual(mochi['seating']['kinds']['pig'],{'trim':-1.5,'forward':0});self.assertEqual(mochi['seating']['note'],'ok')
  # A normalized block (every kind listed, "other" at zero) is accepted again, so a cloned pet loads.
  from seat_kinds import normalize_seating
  self.assertEqual(normalize_seating(mochi['seating'],'mochi'),mochi['seating'])

class ForwardOffset(unittest.TestCase):
 def clip(self):return read(RP/'animations/pet_seating.animation.json')['animations']['animation.pet.seat_align']
 def test_carter_sits_one_pixel_forward_on_a_strider_and_nowhere_else(self):
  by={p['id']:p['seating']['kinds'] for p in PETS}
  self.assertEqual({k:v['forward'] for k,v in by['carter'].items() if v['forward']},{'strider':1})
  for ident in ['mochi','casper']:self.assertFalse(any(v['forward'] for v in by[ident].values()))
 def test_alignment_clip_moves_pet_root_toward_the_nose_for_that_pet_and_kind_only(self):
  from molang_subset import Expression
  from seat_kinds import SEAT_KINDS
  a=self.clip();self.assertEqual(set(a['bones']),{'pet_root'})
  x,y,z=a['bones']['pet_root']['position'];self.assertEqual(x,0)
  self.assertEqual(Expression(y)({'query.is_riding':True},{'pet:seat_lift':12}),12)
  e=Expression(z);strider=SEAT_KINDS.index('strider')
  for pet in PETS:
   for index,kind in enumerate(SEAT_KINDS):
    value=e({'query.is_riding':True,'variable.pet_model_id':pet['wire_id']},{'pet:seat_kind':index})
    # The model faces -z: one pixel toward the nose is -1 in the clip, and only Carter on a strider gets it.
    self.assertEqual(value,-1.0 if (pet['id']=='carter' and kind=='strider') else 0.0,(pet['id'],kind))
   self.assertEqual(e({'query.is_riding':False,'variable.pet_model_id':pet['wire_id']},{'pet:seat_kind':strider}),0.0)
  self.assertEqual(e({'query.is_riding':True,'variable.pet_model_id':0},{'pet:seat_kind':strider}),0.0)
 def test_no_forward_offsets_leaves_the_clip_as_it_was(self):
  from seating import alignment_clip
  from copy import deepcopy
  quiet=[{**deepcopy(p),'seating':{'kinds':{k:{'trim':v['trim'],'forward':0} for k,v in p['seating']['kinds'].items()}}} for p in PETS]
  self.assertEqual(alignment_clip(quiet)['bones']['pet_root']['position'][2],0)
  self.assertEqual(alignment_clip()['bones']['pet_root']['position'][2],0)
 def test_forward_is_validated_like_trim(self):
  from seat_kinds import normalize_seating
  self.assertEqual(normalize_seating({'kinds':{'strider':{'forward':2}}},'x')['kinds']['strider'],{'trim':0,'forward':2})
  for bad in [{'strider':{'forward':17}},{'strider':{'forward':'1'}},{'other':{'forward':1}}]:
   with self.assertRaises(ValueError,msg=str(bad)):normalize_seating({'kinds':bad},'x')

class SeatedHead(unittest.TestCase):
 def setUp(self):
  from seating import ride_clip,rig_pose,head_fit
  self.head_fit=head_fit;self.poses={p['id']:rig_pose(ride_clip(ROOT,p)['bones']) for p in PETS}
 def geometry(self,p):return read(ROOT/p['model'])['minecraft:geometry'][0]
 def test_seated_muzzle_leads_the_chest_as_it_does_standing(self):
  # Before the clearance the pitched chest reached 2.3 pixels ahead of Carter's muzzle and 0.9 deeper into his skull.
  for p in PETS:
   g=self.geometry(p);rest=self.head_fit(g,{});seated=self.head_fit(g,self.poses[p['id']])
   self.assertGreater(rest['lead'],2);self.assertGreater(seated['lead'],2,p['id'])
   self.assertLessEqual(seated['sunk'],rest['sunk']+1e-6,p['id'])
   # Carter's neck is long enough for the full standing lead; the cats stop where the neck would leave the skull.
   if p['id']=='carter':self.assertAlmostEqual(seated['lead'],rest['lead'],places=6)
   else:self.assertAlmostEqual(seated['attach'],0,places=6)
 def test_seated_neck_still_reaches_into_the_skull(self):
  from seating import transformed_vertices
  for p in PETS:
   g=self.geometry(p);pose=self.poses[p['id']]
   head=transformed_vertices(g,pose,['pet_head']);neck=transformed_vertices(g,pose,['pet_neck'])
   self.assertGreaterEqual(head[:,2].max(),neck[:,2].min()-1e-6,p['id'])
   self.assertGreater(neck[:,1].max(),head[:,1].min(),p['id'])
 def test_head_offset_is_baked_on_the_head_bone_only(self):
  for p in PETS:
   clip=read(RP/f'animations/pets/{p["id"]}.animation.json')['animations'][f'animation.pet.{p["id"]}.ride']['bones']
   self.assertIn('position',clip['pet_head']);self.assertNotIn('position',clip.get('pet_jaw',{}))
   for name in ['pet_ear_left','pet_ear_right','pet_neck']:self.assertNotIn(name,clip)
   x,y,z=clip['pet_head']['position'];self.assertEqual(x,0);self.assertLess(z,0)
 def test_head_stays_upright_over_the_front_paws(self):
  from seating import transformed_vertices
  from rig_math import matrices
  for p in PETS:
   g=self.geometry(p);pose={k:{a:np.array(b) for a,b in v.items()} for k,v in self.poses[p['id']].items()}
   np.testing.assert_allclose(matrices(g['bones'],pose)['pet_head'][:3,:3],np.eye(3),atol=1e-7)
   head=transformed_vertices(g,self.poses[p['id']],['pet_head']);paws=transformed_vertices(g,self.poses[p['id']],['pet_front_left_paw'])
   self.assertLess(head[:,2].min(),paws[:,2].min());self.assertGreater(head[:,2].max(),paws[:,2].min())
