"""Quiet-startup package scope checks; not an in-game or Realm validation."""
from pathlib import Path
from io import BytesIO
import hashlib,json,unittest,zipfile
ROOT=Path(__file__).resolve().parents[1]
PROJECT=json.loads((ROOT/'project.json').read_text())
VERSION='.'.join(map(str,PROJECT['version']))

class QuietStartupScope(unittest.TestCase):
    def test_art_models_armor_seating_items_and_morpher_are_unchanged(self):
     from native_armor_reference import assert_unchanged_content
     assert_unchanged_content(self)

    def test_archive_has_the_new_runtime_and_no_startup_announcements(self):
        with zipfile.ZipFile(ROOT/f'dist/ElleeDog_67_Pets_v{VERSION}.mcaddon') as addon:
            with zipfile.ZipFile(BytesIO(addon.read(f'ElleeDog_67_Pets_v{VERSION}_BP.mcpack'))) as bp:
                script=bp.read('scripts/main.js')
                self.assertEqual(script,(ROOT/'src/main.js').read_bytes())
                text=script.decode()
                self.assertNotRegex(text,r'initialSpawn\)\s*safeMessage')
                self.assertNotIn('log(`Registered',text)
                self.assertRegex(text,r'rememberFailure\(player,\s*error,\s*system\.currentTick,\s*["\']lifecycle["\']\);\s*fail\(undefined,\s*error\);')
                self.assertRegex(text,r'restore\(\w+\.player\)')
                self.assertRegex(text,r'name:\s*["\']book["\']')

    def test_no_global_chat_or_game_rule_changes(self):
        text='\n'.join(p.read_text() for p in (ROOT/'src').glob('*.js'))
        for forbidden in ['gamerule','sendcommandfeedback','commandblockoutput','world.sendMessage','onScreenDisplay']:
            self.assertNotIn(forbidden,text)

    def test_current_version_in_both_manifests(self):
        for folder in ['behavior_pack','resource_pack']:
            manifest=json.loads((ROOT/folder/'manifest.json').read_text())
            self.assertEqual(manifest['header']['version'],[0,5,2])
            self.assertIn('NATIVE ARMOR',manifest['header']['name'])

if __name__=='__main__':unittest.main()
