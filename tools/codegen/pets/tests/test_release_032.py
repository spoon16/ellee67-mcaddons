"""Archive identity and baked-geometry invariants; no Minecraft runtime assertions."""
from pathlib import Path
from io import BytesIO
import json, math, unittest, zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]

class Release032(unittest.TestCase):
    def test_both_pack_roots_and_nested_archives_use_shared_icon(self):
        expected=(ROOT/'assets/shared/pack_icon.png').read_bytes()
        with Image.open(BytesIO(expected)) as image:
            self.assertEqual(image.width,image.height)
            self.assertEqual(image.format,'PNG')
        with zipfile.ZipFile(ROOT/'dist/ElleeDog_67_Pets_v0.5.2.mcaddon') as addon:
            self.assertIsNone(addon.testzip())
            self.assertEqual(len(addon.namelist()),4)
            for suffix,folder in [('BP','behavior_pack'),('RP','resource_pack')]:
                self.assertEqual((ROOT/folder/'pack_icon.png').read_bytes(),expected)
                with zipfile.ZipFile(BytesIO(addon.read(f'ElleeDog_67_Pets_v0.5.2_{suffix}.mcpack'))) as pack:
                    self.assertIsNone(pack.testzip())
                    self.assertEqual(pack.read('pack_icon.png'),expected)
                    manifest=json.loads(pack.read('manifest.json'))
                    self.assertEqual(manifest['header']['version'],[0,5,2])
                    self.assertIn('NATIVE ARMOR',manifest['header']['name'])
                    for filename in pack.namelist():
                        self.assertFalse(filename.endswith(('.ttf','.otf','.woff','.woff2','.pyc')))

    def test_texel_outline_is_invariant_under_cube_z_rotation_sign(self):
        # Engine/offline coordinate handedness changed the old parent-bone rotation.
        # The new centered square texels have the same footprint at +/-45 degrees;
        # their horizontal handle comes from the baked *centers*, not that rotation.
        for pet in ['carter','mochi']:
            geo=json.loads((ROOT/f'resource_pack/models/entity/pets/{pet}/tool_pickaxe.geo.json').read_text())
            bone=next(b for b in geo['minecraft:geometry'][0]['bones'] if b['name']=='pet_tool_pixels')
            for cube in bone['cubes']:
                self.assertEqual(cube['size'][0],cube['size'][1])
                self.assertEqual(cube['rotation'],[0,0,45])
                x0,y0=cube['origin'][:2];cx,cy=cube['pivot'][:2];s=cube['size'][0]
                def outline(angle):
                    a=math.radians(angle)
                    return sorted((round(cx+(x-cx)*math.cos(a)-(y-cy)*math.sin(a),7),
                                   round(cy+(x-cx)*math.sin(a)+(y-cy)*math.cos(a),7))
                                  for x in [x0,x0+s] for y in [y0,y0+s])
                self.assertEqual(outline(45),outline(-45))

    def test_source_scope_does_not_add_unrequested_pet_definitions(self):
        definitions=sorted(p.stem for p in (ROOT/'catalog/pets').glob('*.json'))
        self.assertEqual(definitions,['carter','casper','mochi'])
        for pet in definitions:
            data=json.loads((ROOT/f'catalog/pets/{pet}.json').read_text())
            self.assertEqual(data['first_person']['default_hand_height'],2)

if __name__=='__main__':
    unittest.main()
