"""The inventory paperdoll renders the pet: Molang truth tables over the emitted player entity, not a client run."""
from pathlib import Path
from itertools import product
import sys,unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
RP=ROOT/'resource_pack';_,PETS,_=load_catalog(ROOT)
D=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
RC={}
for p in (RP/'render_controllers').glob('*.json'):RC.update(read(p)['render_controllers'])
def assignment(name):
 line=next(s for s in D['scripts']['pre_animation'] if s.startswith(name+' '))
 return Expression(line.split('=',1)[1].rstrip('; '))
TP=assignment('variable.pet_tp');PAWS=assignment('variable.pet_fp_paws')
def env(model,first_person,in_ui):
 return {'variable.is_first_person':first_person,'query.is_in_ui':in_ui,'query.is_spectator':0,'variable.map_face_icon':0},{'pet:model_id':model,'pet:view':'paws'}
def animate(alias):
 return Expression(next(x[alias] for x in D['scripts']['animate'] if isinstance(x,dict) and alias in x))

class Paperdoll(unittest.TestCase):
 def test_pet_body_counts_the_ui_as_third_person_whatever_the_camera(self):
  for p in PETS:
   for first_person in [0,1]:
    self.assertTrue(TP(*env(p['wire_id'],first_person,1)),(p['id'],first_person))
    self.assertFalse(PAWS(*env(p['wire_id'],first_person,1)),(p['id'],first_person))
   # Outside the UI nothing changed: third person shows the body, first person the paws.
   self.assertTrue(TP(*env(p['wire_id'],0,0)));self.assertFalse(TP(*env(p['wire_id'],1,0)))
   self.assertTrue(PAWS(*env(p['wire_id'],1,0)));self.assertFalse(PAWS(*env(p['wire_id'],0,0)))
 def test_player_form_never_draws_a_pet_in_the_ui(self):
  for first_person,in_ui in product([0,1],[0,1]):
   self.assertFalse(TP(*env(0,first_person,in_ui)));self.assertFalse(PAWS(*env(0,first_person,in_ui)))
 def test_pet_body_pass_is_selected_and_the_native_body_hidden_in_the_ui(self):
  conditions={next(iter(row)):Expression(next(iter(row.values()))) for row in D['render_controllers']}
  native=RC['controller.render.player.third_person']['part_visibility'][0]['*']
  for p in PETS:
   for first_person in [0,1]:
    e,props=env(p['wire_id'],first_person,1);e['variable.pet_tp']=TP(e,props);e['variable.pet_model_id']=p['wire_id']
    self.assertTrue(conditions[f'controller.render.pet.{p["id"]}.body'](e,props),(p['id'],first_person))
    self.assertFalse(Expression(native)(e,props),(p['id'],first_person))
    for other in PETS:
     if other is not p:self.assertFalse(conditions[f'controller.render.pet.{other["id"]}.body'](e,props))
 def test_markers_never_render_in_the_ui(self):
  cond=next(next(iter(row.values())) for row in D['render_controllers'] if 'controller.render.pet.marker' in row)
  e,props=env(1,0,1);e['variable.pet_tp']=1;props['pet:debug']=True
  self.assertFalse(Expression(cond)(e,props))
 def test_paperdoll_plays_no_locomotion_or_seat_lift_but_keeps_tail_and_look(self):
  for p in PETS:
   e,props=env(p['wire_id'],0,1);e.update({'variable.pet_tp':1,'variable.pet_model_id':p['wire_id'],'query.is_riding':1,'query.is_sleeping':0});props['pet:motion']=True
   self.assertFalse(animate(f'pet_{p["id"]}_locomotion')(e,props),p['id'])
   self.assertTrue(animate(f'pet_{p["id"]}_secondary')(e,props),p['id']);self.assertTrue(animate(f'pet_{p["id"]}_look')(e,props),p['id'])
   e['query.is_in_ui']=0
   self.assertTrue(animate(f'pet_{p["id"]}_locomotion')(e,props),p['id'])
  seat=animate('pet_seat_align')
  self.assertFalse(seat({'variable.pet_tp':1,'query.is_riding':1,'query.is_in_ui':1}));self.assertTrue(seat({'variable.pet_tp':1,'query.is_riding':1,'query.is_in_ui':0}))

if __name__=='__main__':unittest.main()

class SkinCompatibility(unittest.TestCase):
 """MCPE-74493: a pack shipping entity/player.entity.json reverts every skin to Steve, hides capes and stops
 Character Creator pieces rendering unless the client entity declares min_engine_version <= 1.13.0."""
 def test_client_entity_declares_a_persona_safe_engine_version(self):
  from build import PERSONA_SAFE_ENGINE_VERSION
  declared=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']['min_engine_version']
  self.assertEqual(declared,PERSONA_SAFE_ENGINE_VERSION)
  parts=[int(x) for x in declared.split('.')]
  self.assertEqual(len(parts),3);self.assertLessEqual(parts,[1,13,0],'persona skins need at most 1.13.0')
 def test_the_modern_format_version_is_kept(self):
  # min_engine_version only selects which definition sharing the identifier is parsed; format_version drives parsing,
  # so the file must stay current or the pet properties, attachables and hide_held_items would not be read.
  d=read(RP/'entity/player.entity.json')
  self.assertEqual(d['format_version'],'1.26.0')
  desc=d['minecraft:client_entity']['description']
  self.assertEqual(desc['identifier'],'minecraft:player');self.assertTrue(desc['enable_attachables'])
  self.assertIn('hide_held_items',desc['scripts'])
 def test_the_skin_slots_the_engine_swaps_are_untouched(self):
  # A classic or skin-pack skin lands through these two slots; the render controllers must keep selecting them.
  desc=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
  self.assertEqual(desc['geometry']['default'],'geometry.humanoid.custom')
  self.assertEqual(desc['textures']['default'],'textures/entity/steve')
  tp=RC['controller.render.player.third_person']
  self.assertEqual(tp['geometry'],'Geometry.default');self.assertEqual(tp['textures'],['Texture.default'])
  fp=RC['controller.render.player.first_person']
  self.assertEqual(fp['arrays']['geometries']['Array.pet_models'][0],'Geometry.default')
  self.assertEqual(fp['arrays']['textures']['Array.pet_coats'][0],'Texture.default')
