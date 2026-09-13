"""The exact uploaded artwork must survive the build and both nested packs."""
from pathlib import Path
from io import BytesIO
import hashlib,json,unittest,zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE_SHA256='0dd310dbf7be68be449765d3c581000677a5006633ec79f7528973e62965a6e0'
class UserIcon033(unittest.TestCase):
    def test_original_is_the_actual_user_upload(self):
        self.assertEqual(hashlib.sha256((ROOT/'assets/shared/pack_icon_source.png').read_bytes()).hexdigest(),SOURCE_SHA256)
    def test_all_shipped_icons_are_resize_of_user_upload(self):
        with Image.open(ROOT/'assets/shared/pack_icon_source.png') as original:
            expected=original.convert('RGBA').resize((256,256),Image.Resampling.LANCZOS)
        with zipfile.ZipFile(ROOT/'dist/ElleeDog_67_Pets_v0.5.2.mcaddon') as addon:
            for suffix in ['BP','RP']:
                with zipfile.ZipFile(BytesIO(addon.read(f'ElleeDog_67_Pets_v0.5.2_{suffix}.mcpack'))) as pack:
                    with Image.open(BytesIO(pack.read('pack_icon.png'))) as actual:
                        self.assertEqual(actual.size,(256,256))
                        self.assertEqual(actual.convert('RGBA').tobytes(),expected.tobytes())
                    manifest=json.loads(pack.read('manifest.json'))
                    self.assertEqual(manifest['header']['version'],[0,5,2])
    def test_build_source_pins_original_art(self):
        cfg=json.loads((ROOT/'project.json').read_text())['branding']
        self.assertEqual(cfg['source_sha256'],SOURCE_SHA256)
        self.assertEqual(cfg['source'],'assets/shared/pack_icon_source.png')
