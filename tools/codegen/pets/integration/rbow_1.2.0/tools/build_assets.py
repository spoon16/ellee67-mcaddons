#!/usr/bin/env python3
"""Export 19 pinned PNGs. The adopted equipment/armor art is never repainted.
Blocks use native geometry rendering, not captured inventory thumbnails.
The atlas includes explicitly software-projected block previews for source review.
Usage: python tools/build_assets.py [output_root]
"""
from pathlib import Path
import hashlib,json,shutil,sys
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
ORDER=['rbow_ore','deepslate_rbow_ore','raw_rbow_ore','rbow_ingot','rbow_nug','rbow_block',
 'rbow_sword','rbow_pickaxe','rbow_axe','rbow_shovel','rbow_hoe','rbow_spear',
 'rbow_helmet','rbow_chestplate','rbow_leggings','rbow_boots']
BLOCKS={'rbow_ore','deepslate_rbow_ore','rbow_block'}

def export(output:Path)->None:
 lock=json.loads((ROOT/'docs/art_assets_lock.json').read_text())['sha256']
 source=ROOT/'art/prismatic/textures'
 actual={p.relative_to(source).as_posix() for p in source.rglob('*.png')}
 if actual!=set(lock):raise ValueError('Artwork source and lock file disagree.')
 for relative,expected in lock.items():
  src=source/relative
  if hashlib.sha256(src.read_bytes()).hexdigest()!=expected:raise ValueError(f'Artwork lock mismatch: {relative}')
  dst=output/'textures'/relative;dst.parent.mkdir(parents=True,exist_ok=True)
  if src.resolve()!=dst.resolve():shutil.copyfile(src,dst)
 print(f'Exported {len(lock)} unchanged texture files to {output}.')

def block_projection(side:Image.Image,top:Image.Image)->Image.Image:
 """Opaque isometric cube sampled from actual block faces, never chroma keyed.
 This illustrates the texture. Minecraft chooses its own item camera and lighting.
 """
 a=Image.new('RGBA',(32,32))
 faces=[((2,9),(14,7),(0,14),side,.88),
        ((16,16),(14,-7),(0,14),side,.72),
        ((16,2),(14,7),(-14,7),top,1.0)]
 for origin,u,v,texture,light in faces:
  ox,oy=origin
  poly=[origin,(ox+u[0],oy+u[1]),(ox+u[0]+v[0],oy+u[1]+v[1]),(ox+v[0],oy+v[1])]
  mask=Image.new('1',a.size);ImageDraw.Draw(mask).polygon(poly,fill=1)
  det=u[0]*v[1]-u[1]*v[0]
  for y in range(32):
   for x in range(32):
    if not mask.getpixel((x,y)):continue
    dx=x-ox;dy=y-oy
    s=min(.999,max(0,(dx*v[1]-dy*v[0])/det));t=min(.999,max(0,(u[0]*dy-u[1]*dx)/det))
    rgb=texture.getpixel((int(s*texture.width),int(t*texture.height)))[:3]
    a.putpixel((x,y),tuple(round(c*light) for c in rgb)+(255,))
 return a

def atlas()->None:
 source=ROOT/'art/prismatic/textures';out=Image.new('RGBA',(128,128))
 projection_dir=ROOT/'art/previews/block_projections';projection_dir.mkdir(parents=True,exist_ok=True)
 for i,name in enumerate(ORDER):
  if name in BLOCKS:
   side=Image.open(source/f'blocks/{name}.png').convert('RGBA')
   top=Image.open(source/'blocks/rbow_block_top.png').convert('RGBA') if name=='rbow_block' else side
   image=block_projection(side,top);image.save(projection_dir/f'{name}.png')
  else:image=Image.open(source/f'items/{name}.png').convert('RGBA')
  out.paste(image,((i%4)*32,(i//4)*32))
 for folder in [ROOT/'art/prismatic/previews',ROOT/'art/previews']:
  folder.mkdir(parents=True,exist_ok=True);out.save(folder/'sprite_atlas_128.png')
if __name__=='__main__':
 export(Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'resource_pack');atlas()
