"""1.1.10 external-native-resource contract checks, NOT engine/client tests."""
from __future__ import annotations
import copy, hashlib, json, subprocess, sys, unittest
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parents[1];RP=R/'resource_pack';BP=R/'behavior_pack'
REFERENCE=R/'docs/native_spear_reference'
REMOVED={
 'resource_pack/attachables/rbow_spear_lab5.json',
 'resource_pack/animations/rbow_spear_lab5.animation.json',
 'resource_pack/render_controllers/rbow_spear_lab5.render_controllers.json',
 'resource_pack/models/entity/rbow_spear_lab5.geo.json',
}
ADDED={'resource_pack/attachables/rbow_spear_native.json'}
CHANGED={'behavior_pack/manifest.json','resource_pack/manifest.json','behavior_pack/scripts/main.js',
 'behavior_pack/items/rbow_block.json','behavior_pack/items/rbow_ore.json','behavior_pack/items/deepslate_rbow_ore.json',
 'behavior_pack/THIRD_PARTY_NOTICES.md','resource_pack/THIRD_PARTY_NOTICES.md'}
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def desc():return read(RP/'attachables/rbow_spear_native.json')['minecraft:attachable']['description']
def snapshot():return {p.relative_to(R).as_posix():sha(p) for f in [BP,RP] for p in f.rglob('*') if p.is_file()}

class NativeSpear1110(unittest.TestCase):
 def test_exact_runtime_diff_is_only_spear_wiring_and_release_metadata(self):
  old=read(R/'docs/v1.1.9_runtime_baseline.json')['sha256'];now=snapshot()
  self.assertEqual(set(old)-set(now),REMOVED);self.assertEqual(set(now)-set(old),ADDED)
  self.assertEqual({k for k in old.keys()&now.keys() if old[k]!=now[k]},CHANGED)
 def test_all_twenty_runtime_pngs_unchanged(self):
  old=read(R/'docs/v1.1.9_runtime_baseline.json')['sha256']
  files=list((RP/'textures').rglob('*.png'));self.assertEqual(len(files),20)
  for p in files:self.assertEqual(sha(p),old[p.relative_to(R).as_posix()])
 def test_spear_gameplay_definition_unchanged(self):
  old=read(R/'docs/v1.1.9_runtime_baseline.json')['sha256']
  self.assertEqual(sha(BP/'items/rbow_spear.json'),old['behavior_pack/items/rbow_spear.json'])
 def test_no_custom_spear_models_or_animation_definitions_shipped(self):
  for folder in ['animations','animation_controllers','models','render_controllers']:
   for p in (RP/folder).rglob('*.json'):
    self.assertNotIn('spear',p.name)
    self.assertNotIn('texture_meshes',p.read_text())
  for p in ['models/entity/spear.geo.json','animations/spear.animation.json','animation_controllers/spear.animation_controllers.json']:
   self.assertFalse((RP/p).exists())
 def test_uses_native_model_and_render_controller_by_id(self):
  d=desc();self.assertEqual(d['geometry'],{'default':'geometry.spear'})
  self.assertEqual(d['render_controllers'],['controller.render.item_default'])
 def test_only_custom_identity_and_held_texture(self):
  d=desc();self.assertEqual(d['identifier'],'elleedog:rbow_spear')
  self.assertEqual(d['textures']['default'],'textures/entity/rbow_spear_lab5')
  with Image.open(RP/(d['textures']['default']+'.png')) as im:self.assertEqual(im.size,(32,32))
 def test_native_aliases_match_native_controller_contracts(self):
  aliases=desc()['animations']
  self.assertEqual(aliases,{
   'held_first_person':'animation.spear.held_first_person',
   'held_third_person':'animation.spear.held_third_person',
   'held_controller':'controller.animation.spear.held',
   'hit':'animation.spear.hit',
   'hit_controller':'controller.animation.spear.hit',
  })
  controls=read(REFERENCE/'spear.animation_controllers.json')['animation_controllers']
  animations=read(REFERENCE/'spear.animation.json')['animations']
  self.assertEqual(set(aliases.values()),set(controls)|set(animations))
  for control in controls.values():
   states=control['states'];self.assertIn(control['initial_state'],states)
   for state in states.values():
    for alias in state.get('animations',[]):
     self.assertIn(alias,aliases);self.assertIn(aliases[alias],animations)
    for transition in state.get('transitions',[]):
     self.assertTrue(set(transition)<=set(states))
 def test_animation_scripts_unconditionally_start_the_two_native_controllers(self):
  self.assertEqual(desc()['scripts'],{'animate':['held_controller','hit_controller']})
 def test_no_custom_owner_query_gates_or_transform_arithmetic(self):
  s=json.dumps(desc())
  for token in ['is_owner_identifier_any','pre_animation','position','rotation','scale','??','24.0','-27.0','math.','rbow_grip','rbow_pixels']:
   self.assertNotIn(token,s)
 def test_native_kinetic_hit_sound_alias_is_resolved(self):
  self.assertEqual(desc()['sound_effects'],{'hit':'item.spear.hit'})
  animations=read(REFERENCE/'spear.animation.json')['animations']
  for a in animations.values():
   for event in a.get('sound_effects',{}).values():self.assertIn(event['effect'],desc()['sound_effects'])
 def test_native_bone_matches_the_reference_animation_channels(self):
  g=read(REFERENCE/'spear.geo.json')['minecraft:geometry'][0]
  self.assertEqual(g['description']['identifier'],desc()['geometry']['default'])
  names={b['name'] for b in g['bones']}
  for a in read(REFERENCE/'spear.animation.json')['animations'].values():self.assertTrue(set(a.get('bones',{}))<=names)
 def test_native_references_not_accidentally_packaged_under_vanilla_paths(self):
  for p in REFERENCE.glob('*.json'):
   for folder in ['models/entity','animations','animation_controllers','render_controllers']:
    self.assertFalse((RP/folder/p.name).exists())
 def test_no_resource_player_override_or_player_animation_patch(self):
  self.assertFalse((RP/'entity/player.entity.json').exists())
  for p in RP.rglob('*.json'):
   data=read(p)
   if isinstance(data,dict):
    for key in data.get('animations',{}):self.assertFalse(key.startswith('animation.player.'))
 def test_versions_and_ids_update_as_a_pair(self):
  conf=read(R/'docs/build_settings.json');self.assertEqual(conf['version'],read(R/'release.json')['version'])
  for key,folder in [('bp',BP),('rp',RP)]:
   m=read(folder/'manifest.json');self.assertEqual(m['header']['uuid'],conf['uuid'][key])
   self.assertEqual(m['header']['version'],read(R/'release.json')['version'])
   for module in m['modules']:self.assertEqual(module['version'],read(R/'release.json')['version'])
  self.assertIn({'uuid':conf['uuid']['rp'],'version':read(R/'release.json')['version']},read(BP/'manifest.json')['dependencies'])
 def test_no_new_scripts_for_animation_or_events(self):
  old=(R/'docs/v1.1.9_main_script.txt').read_text();now=(BP/'scripts/main.js').read_text()
  self.assertEqual(now,old.replace('67 Rbow Ore Mod 1.1.9 | diagnostic check','67 Rbow Ore Mod '+'.'.join(map(str,read(R/'release.json')['version']))+' | diagnostic check'))
 def test_historical_labs_not_regenerated_or_built(self):
  for relative in ['tools/build.py','tools/regenerate.py']:
   text=(R/relative).read_text()
   for old in ['build_spear_lab.py','build_spear_alignment.py','Spear_Alignment_Behavior.mcpack','Spear_Lab_Behavior.mcpack']:
    self.assertNotIn(old,text)
 def test_latest_feedback_records_all_four_failures_not_success(self):
  d=read(R/'docs/v1.1.10_user_feedback.json')
  for v in d['alignment_lab_v0.2.0'].values():self.assertTrue(v.startswith('FAIL:'))
 def test_historical_candidate_report_is_not_rewritten_as_a_client_pass(self):
  s=read(R/'docs/v1.1.10_status.json')
  self.assertEqual(s['assistant_client_tests_run'],0);self.assertEqual(s['realm_tests_run'],0)
  self.assertEqual(s['placement_result'],'NOT RUN');self.assertFalse(s['root_cause_confirmed'])
 def test_native_reference_builder_is_deterministic(self):
  before=snapshot()
  subprocess.run([sys.executable,str(R/'tools/build_native_spear.py')],cwd=R,check=True,stdout=subprocess.PIPE)
  self.assertEqual(before,snapshot())

if __name__=='__main__':unittest.main()
