"""Release scope and native sulfur-cube integration contracts. No engine is run."""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
BP=ROOT/'behavior_pack';RP=ROOT/'resource_pack'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
CONFIG=read(ROOT/'release.json')
BASELINE=read(ROOT/'docs/release_1.2.0_baseline.json')
NATIVE=read(ROOT/'docs/sulfur_cube_reference/contract.json')
BLOCKS={'rbow_ore','deepslate_rbow_ore','rbow_block'}
TAG='minecraft:sulfur_cube_archetype_bouncy'

def item(name):return read(BP/f'items/{name}.json')['minecraft:item']
def tags(name):return item(name)['components'].get('minecraft:tags',{}).get('tags',[])
def snapshot():
    return {p.relative_to(ROOT).as_posix():sha(p) for f in (BP,RP)
            for p in f.rglob('*') if p.is_file() and '__pycache__' not in p.parts}

class Release120(unittest.TestCase):
    def test_release_names_versions_ids_and_api_are_synchronized(self):
        self.assertEqual(CONFIG['version'],[1,2,0])
        self.assertEqual(CONFIG['channel'],'release')
        self.assertEqual(CONFIG['archive_label'],'67_Rbow_Ore_Mod_v1.2.0')
        self.assertEqual(read(ROOT/'package.json')['version'],'1.2.0')
        settings=read(ROOT/'docs/build_settings.json')
        self.assertEqual(settings['version'],CONFIG['version'])
        self.assertEqual(settings['api'],CONFIG['script_api'])
        for key,path in [('bp',BP),('rp',RP)]:
            manifest=read(path/'manifest.json')
            self.assertEqual(manifest['header']['version'],CONFIG['version'])
            self.assertEqual(manifest['header']['uuid'],settings['uuid'][key])
            self.assertEqual(manifest['header']['min_engine_version'],CONFIG['min_engine_version'])
            for module in manifest['modules']:self.assertEqual(module['version'],CONFIG['version'])
        self.assertIn({'uuid':settings['uuid']['rp'],'version':CONFIG['version']},read(BP/'manifest.json')['dependencies'])
        self.assertIn({'module_name':'@minecraft/server','version':CONFIG['script_api']},read(BP/'manifest.json')['dependencies'])

    def test_exact_runtime_delta_is_three_item_tags_and_release_metadata(self):
        previous=BASELINE['sha256'];current=snapshot()
        self.assertEqual(set(previous),set(current))
        changed={p for p in current if current[p]!=previous[p]}
        expected={f'behavior_pack/items/{n}.json' for n in BLOCKS}|{
            'behavior_pack/manifest.json','resource_pack/manifest.json',
            'behavior_pack/scripts/main.js','behavior_pack/THIRD_PARTY_NOTICES.md',
            'resource_pack/THIRD_PARTY_NOTICES.md'}
        self.assertEqual(changed,expected)

    def test_every_sulfur_block_item_diff_is_exactly_one_native_tag(self):
        for name in BLOCKS:
            expected=copy.deepcopy(BASELINE['block_items'][name])
            expected['minecraft:item']['components']['minecraft:tags']={'tags':[TAG]}
            self.assertEqual(read(BP/f'items/{name}.json'),expected,name)

    def test_only_the_three_block_items_are_edible(self):
        accepted={p.stem for p in (BP/'items').glob('*.json') if TAG in tags(p.stem)}
        self.assertEqual(accepted,BLOCKS)
        self.assertEqual({'elleedog:'+name for name in accepted},set(CONFIG['sulfur_cube_items']))
        for p in (BP/'items').glob('*.json'):
            sulfur=[t for t in tags(p.stem) if t.startswith('minecraft:sulfur_cube_archetype_')]
            self.assertEqual(sulfur,[TAG] if p.stem in BLOCKS else [],p.name)

    def test_tags_match_native_feed_pickup_tempt_and_absorption_filters(self):
        self.assertEqual(CONFIG['sulfur_cube_item_tag'],NATIVE['bouncy_tag'])
        for name in BLOCKS:
            present=set(tags(name))
            self.assertIn(NATIVE['feed_bouncy_filter']['value'],present)
            self.assertIn(NATIVE['shareable_bouncy_item']['item'],present)
            self.assertIn(NATIVE['absorption_bouncy_branch']['filters']['value'],present)
            self.assertIn(repr(TAG),NATIVE['tempt_items'][0]['tags'])
        self.assertEqual(NATIVE['absorption_bouncy_branch']['trigger'],'minecraft:become_bouncy')
        self.assertTrue(NATIVE['shareables_singular_pickup'])
        self.assertEqual(NATIVE['shareable_bouncy_item']['max_amount'],1)

    def test_actual_blocks_use_native_cube_rendering_not_icons_or_attachable_surrogates(self):
        for name in BLOCKS:
            c=item(name)['components'];identifier='elleedog:'+name
            self.assertEqual(c['minecraft:block_placer'],{'block':identifier,'replace_block_item':True})
            self.assertNotIn('minecraft:icon',c)
            block=read(BP/f'blocks/{name}.json')['minecraft:block']
            self.assertEqual(block['description']['identifier'],identifier)
            self.assertEqual(block['components']['minecraft:geometry'],'minecraft:geometry.full_block')
            for instance in block['components']['minecraft:material_instances'].values():
                self.assertEqual(instance['render_method'],'opaque')
                path=read(RP/'textures/terrain_texture.json')['texture_data'][instance['texture']]['textures']
                self.assertTrue((RP/(path+'.png')).is_file())
            for attachable in (RP/'attachables').glob('*.json'):
                self.assertNotEqual(read(attachable)['minecraft:attachable']['description']['identifier'],identifier)

    def test_native_equip_and_eject_use_the_same_slot_without_replacement_ids(self):
        slots=NATIVE['on_equipment_changed']['slots']
        self.assertEqual(slots[0]['slot'],NATIVE['feed_equip_slot'])
        self.assertEqual(NATIVE['on_sheared']['drop_item']['slot'],NATIVE['feed_equip_slot'])
        self.assertEqual(slots[0]['on_equip'],'minecraft:on_block_absorbed')
        for name in BLOCKS:
            self.assertEqual(item(name)['description']['identifier'],'elleedog:'+name)
            self.assertNotEqual(item(name)['description']['identifier'],'minecraft:tnt')
        self.assertEqual(NATIVE['client_hide_held_items'],'variable.has_absorbed_tnt')

    def test_no_new_cube_override_scripts_or_runtime_resources(self):
        self.assertEqual(snapshot().keys(),BASELINE['sha256'].keys())
        for folder in (BP,RP):
            self.assertFalse(list(folder.rglob('*sulfur*')))
        script=(BP/'scripts/main.js').read_text()
        expected=BASELINE['main_script'].replace('67 Rbow Ore Mod 1.1.10 | diagnostic check','67 Rbow Ore Mod 1.2.0 | diagnostic check')
        self.assertEqual(script,expected)
        for p in (BP/'scripts').glob('*.js'):
            if p.name!='main.js':self.assertEqual(sha(p),BASELINE['sha256'][p.relative_to(ROOT).as_posix()])

    def test_no_wood_recipe_tags_or_changes_to_placed_block_properties(self):
        for name in BLOCKS:
            self.assertFalse(set(tags(name)) & {'minecraft:planks','minecraft:logs','minecraft:logs_that_burn'})
            block=BP/f'blocks/{name}.json'
            self.assertEqual(sha(block),BASELINE['sha256'][block.relative_to(ROOT).as_posix()])
            c=read(block)['minecraft:block']['components']
            self.assertIs(c['minecraft:flammable'],False)
            self.assertIs(c['minecraft:destructible_by_explosion'],False)

    def test_user_confirmed_spear_item_attachable_and_both_textures_unchanged(self):
        for rel in ('behavior_pack/items/rbow_spear.json','resource_pack/attachables/rbow_spear_native.json',
                    'resource_pack/textures/items/rbow_spear.png','resource_pack/textures/entity/rbow_spear_lab5.png'):
            self.assertEqual(sha(ROOT/rel),BASELINE['sha256'][rel],rel)

    def test_all_twenty_runtime_textures_and_branding_unchanged(self):
        images=list((RP/'textures').rglob('*.png'));self.assertEqual(len(images),20)
        for p in [*images,BP/'pack_icon.png',RP/'pack_icon.png']:
            self.assertEqual(sha(p),BASELINE['sha256'][p.relative_to(ROOT).as_posix()])

    def test_all_equipment_recipes_worldgen_and_sleeve_repair_are_preserved(self):
        for folder in ['recipes','blocks','structures','features','feature_rules','loot_tables','entities']:
            for p in (BP/folder).rglob('*'):
                if p.is_file():self.assertEqual(sha(p),BASELINE['sha256'][p.relative_to(ROOT).as_posix()])
        for p in (BP/'items').glob('*.json'):
            if p.stem not in BLOCKS:self.assertEqual(sha(p),BASELINE['sha256'][p.relative_to(ROOT).as_posix()])

    def test_current_status_separates_user_feedback_from_unrun_sulfur_tests(self):
        status=read(ROOT/'docs/release_status.json')
        self.assertEqual(status['version'],CONFIG['version'])
        self.assertEqual(status['user_confirmation']['source_version'],'1.1.10')
        self.assertEqual(status['user_confirmation']['spear_status'],'USER_CONFIRMED')
        self.assertIn('NOT RUN',status['sulfur_cubes']['status'])
        for key in ['assistant_engine_tests_run','assistant_client_tests_run','assistant_realm_tests_run']:
            self.assertEqual(status[key],0)

    def test_notices_are_synchronized_with_source(self):
        for pack in (BP,RP):self.assertEqual((pack/'THIRD_PARTY_NOTICES.md').read_bytes(),(ROOT/'THIRD_PARTY_NOTICES.md').read_bytes())

    def test_regeneration_preserves_the_complete_release(self):
        before=snapshot()
        subprocess.run([sys.executable,str(ROOT/'tools/regenerate.py')],cwd=ROOT,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40)
        self.assertEqual(snapshot(),before)

if __name__=='__main__':unittest.main()
