"""The paperdoll and the skin path: Molang truth tables over the emitted player entity, not a client run."""
from pathlib import Path
from itertools import product
import json,re,sys,unittest
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from catalog import read,load_catalog
from molang_subset import Expression
from build import UI_MODES
RP=ROOT/'resource_pack';_,PETS,_=load_catalog(ROOT)
D=read(RP/'entity/player.entity.json')['minecraft:client_entity']['description']
RC={}
for p in (RP/'render_controllers').glob('*.json'):RC.update(read(p)['render_controllers'])
def assignment(name):
 line=next(s for s in D['scripts']['pre_animation'] if s.startswith(name+' '))
 return Expression(line.split('=',1)[1].rstrip('; '))
TP=assignment('variable.pet_tp');PAWS=assignment('variable.pet_fp_paws')
def env(model,first_person,paperdoll):
 return ({'variable.is_first_person':first_person,'variable.is_paperdoll':paperdoll,'query.is_in_ui':paperdoll,
          'query.is_spectator':0,'variable.map_face_icon':0},{'pet:model_id':model,'pet:view':'paws'})
def animate(alias):
 return Expression(next(x[alias] for x in D['scripts']['animate'] if isinstance(x,dict) and alias in x))

class Paperdoll(unittest.TestCase):
 """0.4.0 made variable.pet_tp true in the UI so the pet would draw in the paperdoll; it did not, and the paperdoll
 went empty, because the native body is hidden wherever the pet replaces it. The paperdoll now keeps the player."""
 def test_the_paperdoll_is_not_pet_territory_whichever_camera_is_active(self):
  for p in PETS:
   for first_person in [0,1]:
    self.assertFalse(TP(*env(p['wire_id'],first_person,1)),(p['id'],first_person))
    self.assertFalse(PAWS(*env(p['wire_id'],first_person,1)),(p['id'],first_person))
   # Outside the paperdoll nothing changed: third person shows the pet body, first person the paws.
   self.assertTrue(TP(*env(p['wire_id'],0,0)));self.assertFalse(TP(*env(p['wire_id'],1,0)))
   self.assertTrue(PAWS(*env(p['wire_id'],1,0)));self.assertFalse(PAWS(*env(p['wire_id'],0,0)))
 def test_either_ui_signal_alone_keeps_the_pet_out_of_the_paperdoll(self):
  # 0.4.1 relied on variable.is_paperdoll alone and the paperdoll stayed empty on a device. query.is_in_ui is the
  # engine's own query for an entity drawn as part of the UI, and either signal on its own now excludes the pet.
  for p in PETS:
   for signal in ['variable.is_paperdoll','query.is_in_ui']:
    e,props=env(p['wire_id'],0,0);e[signal]=1;self.assertFalse(TP(e,props),(p['id'],signal))
    e,props=env(p['wire_id'],1,0);e[signal]=1;self.assertFalse(PAWS(e,props),(p['id'],signal))
 def test_the_player_body_draws_in_the_paperdoll_and_no_pet_pass_does(self):
  conditions={next(iter(row)):Expression(next(iter(row.values()))) for row in D['render_controllers']}
  native=Expression(RC['controller.render.player.third_person']['part_visibility'][0]['*'])
  for p in PETS:
   for first_person in [0,1]:
    e,props=env(p['wire_id'],first_person,1);e['variable.pet_tp']=TP(e,props);e['variable.pet_model_id']=p['wire_id']
    self.assertTrue(native(e,props),(p['id'],first_person))
    for other in PETS:self.assertFalse(conditions[f'controller.render.pet.{other["id"]}.body'](e,props),other['id'])
 def test_every_rule_that_hides_the_human_lets_go_in_the_paperdoll(self):
  # Three files hide the player while a pet is active: the native body, the persona passes and the cape. A paperdoll
  # that misses any one of them shows a half-erased character, which is what "no model preview" looked like.
  rows=[('player',RC['controller.render.player.third_person']['part_visibility'])]
  rows+=[(n,c['part_visibility']) for n,c in RC.items() if n.startswith('controller.render.persona') and n.endswith('.third_person')]
  rows+=[('cape',RC['controller.render.player.cape']['part_visibility'])]
  for p in PETS:
   e,props=env(p['wire_id'],0,1);e.update({'variable.pet_tp':TP(e,props),'variable.helmet_layer_visible':1,
     'variable.leg_layer_visible':1,'variable.boot_layer_visible':1,'variable.chest_layer_visible':1,
     'query.has_cape':1,'query.armor_texture_slot':lambda *a:0,'variable.is_blinking':0})
   for name,visibility in rows:
    self.assertTrue(Expression(visibility[0]['*'])(e,props),(p['id'],name))
 def test_the_world_still_hides_the_human_for_a_pet(self):
  native=Expression(RC['controller.render.player.third_person']['part_visibility'][0]['*'])
  cape=Expression(RC['controller.render.player.cape']['part_visibility'][0]['*'])
  for p in PETS:
   e,props=env(p['wire_id'],0,0);e['variable.pet_tp']=TP(e,props)
   self.assertFalse(native(e,props),p['id']);self.assertFalse(cape(e,props),p['id'])
  e,props=env(0,0,0);e['variable.pet_tp']=TP(e,props)
  self.assertTrue(native(e,props));self.assertTrue(cape(e,props))
 def test_player_form_never_draws_a_pet_anywhere(self):
  for first_person,paperdoll in product([0,1],[0,1]):
   self.assertFalse(TP(*env(0,first_person,paperdoll)));self.assertFalse(PAWS(*env(0,first_person,paperdoll)))
 def test_markers_never_render_in_the_ui(self):
  cond=next(next(iter(row.values())) for row in D['render_controllers'] if 'controller.render.pet.marker' in row)
  e,props=env(1,0,1);e['variable.pet_tp']=1;props['pet:debug']=True
  self.assertFalse(Expression(cond)(e,props))
 def test_pet_clips_follow_the_body_rather_than_a_second_ui_rule(self):
  # Every pet clip is gated on variable.pet_tp, so excluding the paperdoll once excludes it everywhere; 0.4.0 had to
  # special-case the locomotion controller and the seat lift on top of the gate.
  for p in PETS:
   for name in ['locomotion','secondary','look','grip','shield_pose']:
    self.assertNotIn('is_in_ui',str(animate(f'pet_{p["id"]}_{name}').tokens),(p['id'],name))
  seat=animate('pet_seat_align')
  self.assertTrue(seat({'variable.pet_tp':1,'query.is_riding':1}));self.assertFalse(seat({'variable.pet_tp':0,'query.is_riding':1}))

VANILLA={next(iter(row)):next(iter(row.values())) for row in read(ROOT/'upstream/player.entity.json')['minecraft:client_entity']['description']['render_controllers']}
CONDITIONS={next(iter(row)):Expression(next(iter(row.values()))) for row in D['render_controllers']}
UI_VARIABLES=[f'variable.pet_ui_{m}' for m in UI_MODES[1:]]+['variable.pet_ui_hide','variable.pet_ui_hide_body']

class PaperdollExperiment(unittest.TestCase):
 """/pet:ui: inside the UI render of a pet form each mode changes exactly one thing, and nothing changes anywhere
 else. Truth tables over the emitted Molang; what a device shows for each mode is the experiment itself."""
 def world(self,model,first_person,paperdoll,mode):
  e,props=env(model,first_person,paperdoll);props['pet:ui_mode']=mode
  for name in ['variable.pet_index','variable.pet_model_id','variable.pet_tp']+UI_VARIABLES:e[name]=assignment(name)(e,props)
  e.update({'variable.helmet_layer_visible':1,'variable.leg_layer_visible':1,'variable.boot_layer_visible':1,'variable.chest_layer_visible':1,
            'query.has_cape':1,'query.armor_texture_slot':lambda *a:0,'variable.is_blinking':0,'item_mainhand':''})
  return e,props
 def listed(self,name,e,props):return bool(CONDITIONS[name](e,props))
 def vanilla_listed(self,name,e,props):return bool(Expression(VANILLA[name])(e,props))
 def visible(self,name,e,props):return bool(Expression(RC[name]['part_visibility'][0]['*'])(e,props))
 def arms(self,e,props):
  rule=next(row['rightArm'] for row in RC['controller.render.player.first_person']['part_visibility'] if 'rightArm' in row)
  return bool(Expression(rule)(e,props))
 def human(self,e,props):
  """(native body, persona bodies, cape, first-person arms): what part_visibility lets through of the human."""
  persona=[n for n in RC if n.startswith('controller.render.persona') and n.endswith('.third_person')]
  return (self.visible('controller.render.player.third_person',e,props),all(self.visible(n,e,props) for n in persona),
          self.visible('controller.render.player.cape',e,props),self.arms(e,props))
 def pet_passes(self,pet,e,props):
  return tuple(self.listed(f'controller.render.pet.{pet["id"]}.{p}',e,props) for p in ['body','ui_static','ui_first'])
 def test_the_modes_are_declared_once_and_agree_with_the_scripts(self):
  self.assertEqual(UI_MODES,['player','pet','pet_static','pet_first','no_player'])
  prop=read(ROOT/'behavior_pack/entities/player.json')['minecraft:entity']['description']['properties']['pet:ui_mode']
  self.assertEqual(prop,{'type':'int','range':[0,len(UI_MODES)-1],'default':0,'client_sync':True})
  scripts=(ROOT/'src/settings.js').read_text()
  listed=re.search(r'UI_MODES\s*=\s*Object\.freeze\(\[([^\]]*)\]',scripts).group(1)
  self.assertEqual(re.findall(r'"([a-z_]+)"',listed),UI_MODES)
 def test_mode_player_is_the_shipped_paperdoll(self):
  for p in PETS:
   for first_person in [0,1]:
    e,props=self.world(p['wire_id'],first_person,1,0)
    for name in UI_VARIABLES:self.assertFalse(e[name],name)
    self.assertEqual(self.human(e,props),(True,True,True,True))
    for name in VANILLA:self.assertEqual(self.listed(name,e,props),self.vanilla_listed(name,e,props),name)
    for other in PETS:self.assertEqual(self.pet_passes(other,e,props),(False,False,False),other['id'])
 def test_each_mode_changes_one_thing_inside_the_ui(self):
  for p in PETS:
   for first_person in [0,1]:
    for wire,mode in list(enumerate(UI_MODES))[1:]:
     e,props=self.world(p['wire_id'],first_person,1,wire)
     self.assertEqual([m for m in UI_MODES[1:] if e[f'variable.pet_ui_{m}']],[mode])
     self.assertTrue(e['variable.pet_ui_hide']);self.assertEqual(bool(e['variable.pet_ui_hide_body']),mode!='no_player')
     # One pet channel at most, and only this pet's.
     for other in PETS:
      mine=other is p
      self.assertEqual(self.pet_passes(other,e,props),(mine and mode=='pet',mine and mode=='pet_static',mine and mode=='pet_first'),(other['id'],mode))
     # The human: hidden through part_visibility in the pet modes, still visible but unlisted in no_player; the
     # persona pieces, the cape and the first-person arms hidden in every mode.
     self.assertEqual(self.human(e,props),(mode=='no_player',False,False,False),(p['id'],first_person,mode))
     for name in ['controller.render.player.first_person','controller.render.player.third_person']:
      self.assertEqual(self.listed(name,e,props),mode!='no_player' and self.vanilla_listed(name,e,props),(name,mode))
     for name in VANILLA:
      if name.endswith('spectator') or name.endswith('.map'):self.assertEqual(self.listed(name,e,props),self.vanilla_listed(name,e,props),name)
 def test_no_mode_changes_anything_outside_the_ui(self):
  for p in PETS:
   for first_person in [0,1]:
    for wire in range(len(UI_MODES)):
     e,props=self.world(p['wire_id'],first_person,0,wire)
     for name in UI_VARIABLES:self.assertFalse(e[name],name)
     self.assertEqual(bool(e['variable.pet_tp']),not first_person)
     self.assertEqual(self.pet_passes(p,e,props),(not first_person,False,False))
     self.assertEqual(self.human(e,props),(bool(first_person),bool(first_person),bool(first_person),True))
     for name in VANILLA:self.assertEqual(self.listed(name,e,props),self.vanilla_listed(name,e,props),name)
 def test_the_player_form_ignores_the_mode(self):
  for first_person,paperdoll in product([0,1],[0,1]):
   for wire in range(len(UI_MODES)):
    e,props=self.world(0,first_person,paperdoll,wire)
    for name in UI_VARIABLES:self.assertFalse(e[name],name)
    self.assertEqual(self.human(e,props),(True,True,True,True))
    for name in VANILLA:self.assertEqual(self.listed(name,e,props),self.vanilla_listed(name,e,props),name)
    for p in PETS:self.assertEqual(self.pet_passes(p,e,props),(False,False,False))
 def test_the_pet_channels_differ_only_as_their_modes_say(self):
  for p in PETS:
   body=RC[f'controller.render.pet.{p["id"]}.body'];static=RC[f'controller.render.pet.{p["id"]}.ui_static'];first=RC[f'controller.render.pet.{p["id"]}.ui_first']
   self.assertIs(body['rebuild_animation_matrices'],True);self.assertEqual(first,body)
   self.assertNotIn('rebuild_animation_matrices',static);self.assertEqual({k:v for k,v in body.items() if k!='rebuild_animation_matrices'},static)
  names=[next(iter(row)) for row in D['render_controllers']]
  self.assertEqual(names[:len(PETS)],[f'controller.render.pet.{p["id"]}.ui_first' for p in PETS])
  self.assertEqual([n for n in names if n in VANILLA],list(VANILLA))

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

class ReplacedVanillaFiles(unittest.TestCase):
 """A render controller file in a pack replaces the vanilla file of that name, so anything vanilla defined there and
 the pack does not is gone for every player. 0.4.0 shipped four such holes, three of them still referenced."""
 PINNED='player.render_controllers.json','persona.render_controllers.json'
 def emitted(self,filename):return read(RP/'render_controllers'/filename)['render_controllers']
 def test_every_controller_the_replaced_vanilla_files_define_is_still_defined(self):
  for filename in self.PINNED:
   vanilla=read(ROOT/'upstream'/filename)['render_controllers'];ours=self.emitted(filename)
   self.assertLessEqual(set(vanilla),set(ours),filename)
 def test_the_pinned_copies_are_the_files_the_provenance_names(self):
  import hashlib
  p=read(ROOT/'upstream/render_controllers.PROVENANCE.json')
  for filename,entry in p['files'].items():
   raw=(ROOT/'upstream'/filename).read_bytes()
   self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['sha256_normalised'],filename)
   self.assertEqual(sorted(read(ROOT/'upstream'/filename)['render_controllers']),sorted(entry['controllers']),filename)
 def test_the_controllers_only_vanilla_supplies_are_copied_untouched(self):
  for filename in self.PINNED:
   vanilla=read(ROOT/'upstream'/filename)['render_controllers'];ours=self.emitted(filename)
   for name,entry in vanilla.items():
    # The pack rewrites the passes it gates (player first/third person, the persona bodies); the rest must be vanilla.
    if json.dumps(ours[name])!=json.dumps(entry):
     self.assertIn('pet',json.dumps(ours[name]),f'{filename}/{name} differs from vanilla for no pet reason')
 def test_the_client_entity_asks_for_nothing_that_is_not_defined(self):
  defined=set()
  for f in (RP/'render_controllers').glob('*.json'):defined|=set(read(f)['render_controllers'])
  for row in D['render_controllers']:
   for name in ([row] if isinstance(row,str) else row):self.assertIn(name,defined)
