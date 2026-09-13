"""Prismatic asset QA. Tests data/pixels, NOT Minecraft rendering or gameplay."""
from __future__ import annotations
import colorsys, hashlib, json, subprocess, sys, tempfile, unittest
from collections import deque
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
TEX=ROOT/'resource_pack/textures'
ART=ROOT/'art/prismatic'

def components(image):
    alpha=image.getchannel('A');points={(x,y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x,y))}
    sizes=[]
    while points:
        seed=points.pop();q=deque([seed]);n=1
        while q:
            x,y=q.popleft()
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    p=x+dx,y+dy
                    if p in points:points.remove(p);q.append(p);n+=1
        sizes.append(n)
    return sorted(sizes,reverse=True)

class PrismaticArt(unittest.TestCase):
    def test_runtime_images_are_exactly_the_new_authored_files(self):
        authored=list((ART/'textures').rglob('*.png'))
        self.assertEqual(len(authored),19)
        for p in authored:self.assertEqual(p.read_bytes(),(TEX/p.relative_to(ART/'textures')).read_bytes(),str(p))
    def test_inventory_dimensions(self):
        for p in (TEX/'items').glob('*.png'):
            with Image.open(p) as im:self.assertEqual(im.size,(32,32));self.assertEqual(im.mode,'RGBA')
    def test_armor_dimensions_and_distinct_layers(self):
        a=Image.open(TEX/'models/armor/rbow_1.png');b=Image.open(TEX/'models/armor/rbow_2.png')
        self.assertEqual(a.size,(128,64));self.assertEqual(b.size,(128,64));self.assertNotEqual(a.tobytes(),b.tobytes())
    def test_silhouettes_have_no_floating_noise(self):
        for p in (TEX/'items').glob('*.png'):
            sizes=components(Image.open(p).convert('RGBA'))
            self.assertEqual(len(sizes),2 if p.stem=='rbow_boots' else 1,str(p))
            self.assertGreater(min(sizes),80,str(p))
    def test_rainbow_armor_not_monochrome_with_a_few_colored_pixels(self):
        for p in [*(TEX/'items').glob('rbow_*')]:
            if p.stem not in {'rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots'}:continue
            bins=set();sat=0;count=0
            image=Image.open(p).convert('RGBA')
            for r,g,b,a in (image.getpixel((x,y)) for y in range(image.height) for x in range(image.width)):
                if not a:continue
                h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255);count+=1
                if s>.40 and v>.38:sat+=1;bins.add(min(6,int(h*7)))
            self.assertGreaterEqual(len(bins),6,p.stem)
            self.assertGreater(sat/count,.64,p.stem) # deliberate dark bevel/white specular edges
    def test_all_seven_reported_visual_paths_resolve(self):
        atlas=json.loads((TEX/'item_texture.json').read_text())['texture_data']
        terrain=json.loads((TEX/'terrain_texture.json').read_text())['texture_data']
        for name in ['rbow_block','rbow_ore','deepslate_rbow_ore']:
            component=json.loads((ROOT/f'behavior_pack/blocks/{name}.json').read_text())['minecraft:block']['components']
            self.assertEqual(component['minecraft:geometry'],'minecraft:geometry.full_block')
            for material in component['minecraft:material_instances'].values():
                self.assertEqual(material['render_method'],'opaque')
                p=ROOT/'resource_pack'/(terrain[material['texture']]['textures']+'.png')
                self.assertEqual(Image.open(p).convert('RGBA').getchannel('A').getextrema(),(255,255))
        for name in ['rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots']:
            p=ROOT/'resource_pack'/(atlas['elleedog:'+name]['textures']+'.png')
            self.assertTrue(p.is_file());self.assertIsNotNone(Image.open(p).getbbox())
    def test_atlas_is_composed_from_runtime_sprites_and_labeled_block_projections(self):
        order=['rbow_ore','deepslate_rbow_ore','raw_rbow_ore','rbow_ingot','rbow_nug','rbow_block','rbow_sword','rbow_pickaxe','rbow_axe','rbow_shovel','rbow_hoe','rbow_spear','rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots']
        atlas=Image.open(ART/'previews/sprite_atlas_128.png').convert('RGBA')
        for i,name in enumerate(order):
            x=i%4*32;y=i//4*32
            image=ROOT/f'art/previews/block_projections/{name}.png' if name in {'rbow_block','rbow_ore','deepslate_rbow_ore'} else TEX/'items'/f'{name}.png'
            self.assertEqual(atlas.crop((x,y,x+32,y+32)).tobytes(),Image.open(image).convert('RGBA').tobytes())
    def test_export_restores_exact_pinned_runtime_pixels(self):
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([sys.executable,str(ROOT/'tools/build_assets.py'),temp],check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
            for original in (ART/'textures').rglob('*.png'):
                relative=original.relative_to(ART/'textures');p=TEX/relative
                self.assertEqual((Path(temp)/'textures'/relative).read_bytes(),p.read_bytes(),str(relative))
    def test_exporter_does_not_repaint_existing_art(self):
        source=(ROOT/'tools/build_assets.py').read_text()
        self.assertIn('art_assets_lock.json',source)
        self.assertIn('shutil.copyfile',source)
        self.assertNotIn('art/references',source)
        self.assertNotIn('netherite_',source)
        self.assertNotIn('approved_concept.png',source)

if __name__=='__main__':unittest.main()
