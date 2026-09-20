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
