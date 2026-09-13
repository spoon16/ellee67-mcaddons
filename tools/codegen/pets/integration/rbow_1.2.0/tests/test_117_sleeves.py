"""Sleeve repair invariants. Pixel/pack tests only, not a Minecraft client test."""
from pathlib import Path
import hashlib, json, unittest
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
BP=ROOT/'behavior_pack'; RP=ROOT/'resource_pack'
FIX=json.loads((ROOT/'docs/v1.1.7_sleeve_fix.json').read_text())
OLD=ROOT/'art/references/rbow_1.v1.1.6.png'
NEW=RP/'textures/models/armor/rbow_1.png'

def read(path):return json.loads(path.read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

class SleeveCleanup117(unittest.TestCase):
    def test_before_fixture_matches_actual_116_runtime(self):
        before=read(ROOT/'docs/v1.1.6_runtime_baseline.json')['sha256']
        self.assertEqual(digest(OLD),before['resource_pack/textures/models/armor/rbow_1.png'])
        self.assertEqual(digest(OLD),FIX['source_before_sha256'])

    def test_bottom_rectangle_is_derived_from_native_box_uv(self):
        x,y=FIX['native_uv_origin']; w,h,d=FIX['native_arm_cube_size']
        rectangle=[x+d+w,y,x+d+2*w,y+d]
        self.assertEqual(rectangle,FIX['bottom_face_uv_rectangle_exclusive'])
        self.assertEqual([v*FIX['uv_scale'] for v in rectangle],FIX['bottom_face_exported_rectangle_exclusive'])

    def test_baseline_reproduces_disconnected_opaque_cap(self):
        im=Image.open(OLD).convert('RGBA')
        self.assertEqual(im.crop(tuple(FIX['bottom_face_exported_rectangle_exclusive'])).getchannel('A').getextrema(),(255,255))
        self.assertEqual(im.crop(tuple(FIX['existing_open_sleeve_side_rectangle_exclusive'])).getchannel('A').getextrema(),(0,0))

    def test_exactly_64_pixels_change_only_inside_bottom_cap(self):
        old=Image.open(OLD).convert('RGBA');new=Image.open(NEW).convert('RGBA')
        changed={(x,y) for y in range(old.height) for x in range(old.width) if old.getpixel((x,y))!=new.getpixel((x,y))}
        self.assertEqual(changed,{(x,y) for y in range(32,40) for x in range(96,104)})
        self.assertEqual(len(changed),64)

    def test_cap_is_fully_transparent_and_zero_rgb(self):
        im=Image.open(NEW).convert('RGBA')
        for y in range(32,40):
            for x in range(96,104):self.assertEqual(im.getpixel((x,y)),(0,0,0,0))

    def test_cuff_sides_stay_open_no_sleeve_length_change(self):
        old=Image.open(OLD).convert('RGBA');new=Image.open(NEW).convert('RGBA')
        rectangle=(80,40,112,64)
        self.assertEqual(old.crop(rectangle).tobytes(),new.crop(rectangle).tobytes())
        self.assertEqual(new.crop((80,58,112,64)).getchannel('A').getextrema(),(0,0))

    def test_shoulder_caps_and_body_pixels_unchanged(self):
        old=Image.open(OLD).convert('RGBA');new=Image.open(NEW).convert('RGBA')
        for rectangle in [(88,32,96,40),(32,32,80,64),(0,0,128,32),(0,32,32,64)]:
            self.assertEqual(old.crop(rectangle).tobytes(),new.crop(rectangle).tobytes(),str(rectangle))

    def test_all_surviving_colored_pixels_identical(self):
        old=Image.open(OLD).convert('RGBA');new=Image.open(NEW).convert('RGBA')
        for y in range(new.height):
            for x in range(new.width):
                if new.getpixel((x,y))[3]:self.assertEqual(new.getpixel((x,y)),old.getpixel((x,y)))

    def test_exactly_one_legacy_runtime_png_changed(self):
        before=read(ROOT/'docs/v1.1.6_runtime_baseline.json')['sha256']
        images=[p for p in (RP/'textures').rglob('*.png') if p.name!='rbow_spear_lab5.png'];self.assertEqual(len(images),19)
        changed=[p.relative_to(RP).as_posix() for p in images if digest(p)!=before[p.relative_to(ROOT).as_posix()]]
        self.assertEqual(changed,['textures/models/armor/rbow_1.png'])

    def test_gameplay_identical_except_diagnostic_version(self):
        before=read(ROOT/'docs/v1.1.6_runtime_baseline.json')['sha256']
        for p in BP.rglob('*'):
            if p.is_file() and p.relative_to(BP).as_posix() not in ['manifest.json','scripts/main.js','items/rbow_block.json','items/rbow_ore.json','items/deepslate_rbow_ore.json','THIRD_PARTY_NOTICES.md']:
                self.assertEqual(digest(p),before[p.relative_to(ROOT).as_posix()],str(p))
        old_main=read(ROOT/'docs/v1.1.6_main_script.json')['text']
        self.assertEqual((BP/'scripts/main.js').read_text(),old_main.replace('67 Rbow Ore Mod 1.1.6 | diagnostic check','67 Rbow Ore Mod '+'.'.join(map(str,read(ROOT/'release.json')['version']))+' | diagnostic check'))

    def test_spear_item_and_icon_unchanged(self):
        before=read(ROOT/'docs/v1.1.6_runtime_baseline.json')['sha256']
        for rel in ['behavior_pack/items/rbow_spear.json','resource_pack/textures/items/rbow_spear.png']:
            self.assertEqual(digest(ROOT/rel),before[rel])

    def test_both_chestplate_routes_still_native_and_shared_texture(self):
        before=read(ROOT/'docs/v1.1.6_runtime_baseline.json')['sha256']
        for suffix in ['', '.player']:
            p=RP/f'attachables/rbow_chestplate{suffix}.json'
            self.assertEqual(digest(p),before[p.relative_to(ROOT).as_posix()])
            d=read(p)['minecraft:attachable']['description']
            self.assertEqual(d['textures']['default'],'textures/models/armor/rbow_1')
            self.assertEqual(d['render_controllers'],['controller.render.armor'])
        self.assertIn('minecraft:trimmable_armors',read(BP/'items/rbow_chestplate.json')['minecraft:item']['components']['minecraft:tags']['tags'])

    def test_pinned_source_and_runtime_same_new_atlas(self):
        self.assertEqual(NEW.read_bytes(),(ROOT/'art/prismatic/textures/models/armor/rbow_1.png').read_bytes())
        self.assertEqual(digest(NEW),FIX['source_after_sha256'])
        self.assertEqual(digest(NEW),read(ROOT/'docs/art_assets_lock.json')['sha256']['models/armor/rbow_1.png'])

    def test_status_does_not_claim_client_test(self):
        for key in ['engine_tests_run','client_render_tests_run','realm_tests_run']:self.assertEqual(FIX[key],0)
        self.assertFalse(FIX['geometry_changed']);self.assertFalse(FIX['rainbow_colors_changed'])
        self.assertFalse(FIX['sleeve_length_changed'])

if __name__=='__main__':unittest.main()
