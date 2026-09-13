#!/usr/bin/env python3
"""Software UV preview using exported Rbow PNGs. NOT a Minecraft screenshot.
All armor meshes use simple standard humanoid box dimensions and UV rectangles.
No network, Blender, renderer, or vanilla skin/armor pixels are used.
"""
import math,sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
TEX=ROOT/'textures'
A1=np.array(Image.open(TEX/'models/armor/rbow_1.png').convert('RGBA'))
A2=np.array(Image.open(TEX/'models/armor/rbow_2.png').convert('RGBA'))

def render(yaw,scale=15,w=460,h=590):
 canvas=np.zeros((h,w,4),dtype=np.uint8)
 zbuffer=np.ones((h,w),dtype=float)*-1e9
 camera=np.array([math.sin(yaw)*math.cos(.13),math.sin(.13),math.cos(yaw)*math.cos(.13)])
 right=np.array([math.cos(yaw),0,-math.sin(yaw)])
 up=np.cross(camera,right)
 def project(v):
  p=np.array(v,dtype=float);p-=np.array([0,16,0])
  return np.array([w*.5+np.dot(p,right)*scale,h*.5-np.dot(p,up)*scale,np.dot(p,camera)])
 def face(origin,U,V,tex,uv,normal):
  if np.dot(camera,np.array(normal))<=0:return
  o=project(origin);u=project(np.array(origin)+U)-o;v=project(np.array(origin)+V)-o
  corners=np.array([o,o+u,o+u+v,o+v]);x0=max(0,int(corners[:,0].min()));x1=min(w,int(corners[:,0].max())+1)
  y0=max(0,int(corners[:,1].min()));y1=min(h,int(corners[:,1].max())+1)
  if x1<=x0 or y1<=y0:return
  Y,X=np.mgrid[y0:y1,x0:x1];dx=X+.5-o[0];dy=Y+.5-o[1];det=u[0]*v[1]-u[1]*v[0]
  if abs(det)<.0001:return
  s=(dx*v[1]-dy*v[0])/det;t=(u[0]*dy-u[1]*dx)/det
  valid=(s>=0)&(s<1)&(t>=0)&(t<1)
  xuv,yuv,uw,uh=uv
  tx=np.clip((xuv+s*uw).astype(int),0,tex.shape[1]-1);ty=np.clip((yuv+t*uh).astype(int),0,tex.shape[0]-1)
  rgba=tex[ty,tx].copy();depth=o[2]+s*u[2]+t*v[2]
  valid&=(rgba[:,:,3]>0)&(depth>zbuffer[y0:y1,x0:x1])
  # Preview lighting, not baked into the textures.
  lighting=.76+.24*max(0,np.dot(normal,np.array([-.4,.72,.65])))
  rgba[:,:,:3]=(rgba[:,:,:3]*lighting).astype(np.uint8)
  out=canvas[y0:y1,x0:x1];z=zbuffer[y0:y1,x0:x1];out[valid]=rgba[valid];z[valid]=depth[valid]
 def cube(bounds,tex,x=0,y=0,uw=8,uh=8,ud=8,inflate=0,S=2):
  x0,y0,z0,x1,y1,z1=bounds;x0-=inflate;y0-=inflate;z0-=inflate;x1+=inflate;y1+=inflate;z1+=inflate
  W=x1-x0;H=y1-y0;D=z1-z0
  face((x0,y1,z1),(W,0,0),(0,-H,0),tex,((x+ud)*S,(y+ud)*S,uw*S,uh*S),(0,0,1))
  face((x1,y1,z0),(-W,0,0),(0,-H,0),tex,((x+2*ud+uw)*S,(y+ud)*S,uw*S,uh*S),(0,0,-1))
  face((x0,y1,z0),(0,0,D),(0,-H,0),tex,(x*S,(y+ud)*S,ud*S,uh*S),(-1,0,0))
  face((x1,y1,z1),(0,0,-D),(0,-H,0),tex,((x+ud+uw)*S,(y+ud)*S,ud*S,uh*S),(1,0,0))
  face((x0,y1,z0),(W,0,0),(0,0,D),tex,((x+ud)*S,y*S,uw*S,ud*S),(0,1,0))
  face((x0,y0,z1),(W,0,0),(0,0,-D),tex,((x+ud+uw)*S,y*S,uw*S,ud*S),(0,-1,0))
 # Neutral charcoal display mannequin: not a player skin, and no face/identity.
 base=np.empty((64,128,4),dtype=np.uint8);base[:]=(73,87,105,255)
 # Neutral skin is intentionally uniform; transparent areas are readable.
 for b,uvw in [((-4,24,-4,4,32,4),(8,8,8)),((-4,12,-2,4,24,2),(8,12,4)),
               ((-8,12,-2,-4,24,2),(4,12,4)),((4,12,-2,8,24,2),(4,12,4)),
               ((-4.55,0,-2,-.55,12,2),(4,12,4)),((.55,0,-2,4.55,12,2),(4,12,4))]:
  cube(b,base,uw=uvw[0],uh=uvw[1],ud=uvw[2])
 # Render order is irrelevant: the z buffer protects nearer faces. Translucent
 # armor holes leave already-rendered underlying faces untouched.
 cube((-4,24,-4,4,32,4),A1,0,0,8,8,8,.55)
 cube((-4,12,-2,4,24,2),A1,16,16,8,12,4,.6)
 cube((-8,12,-2,-4,24,2),A1,40,16,4,12,4,.55)
 cube((4,12,-2,8,24,2),A1,40,16,4,12,4,.55)
 cube((-4,12,-2,4,24,2),A2,16,16,8,12,4,.32)
 for b in [(-4.55,0,-2,-.55,12,2),(.55,0,-2,4.55,12,2)]:
  cube(b,A2,0,16,4,12,4,.32)
  cube(b,A1,0,16,4,12,4,.55)
 return Image.fromarray(canvas)
def font_at(size):
 for candidate in ['DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                   '/System/Library/Fonts/Supplemental/Arial.ttf', 'C:/Windows/Fonts/arial.ttf']:
  try:return ImageFont.truetype(candidate,size)
  except OSError:pass
 try:return ImageFont.load_default(size=size)
 except TypeError:return ImageFont.load_default()

f=font_at(20);sm=font_at(16);lg=font_at(32)
p=Image.new('RGB',(1280,950),(13,17,27));d=ImageDraw.Draw(p)
d.text((36,25),'67 RBOW / WORN ARMOR TEXTURES',font=lg,fill=(242,245,253))
d.text((39,73),'Software UV projection of the actual exported armor textures — not an in-game screenshot',font=sm,fill=(164,185,210))
for i,(angle,label) in enumerate([(-.48,'FRONT / THREE-QUARTER'),(math.pi-.48,'BACK / THREE-QUARTER')]):
 x=31+i*610;y=112
 d.rounded_rectangle((x,y,x+586,y+649),12,fill=(23,30,45))
 d.ellipse((x+90,y+568,x+490,y+610),fill=(13,18,30))
 r=render(angle,scale=17,w=560,h=630);p.paste(r,(x+13,y+4),r)
 tw=d.textlength(label,font=f);d.text((x+(586-tw)/2,y+610),label,font=f,fill=(223,233,249))
for i,layer in enumerate([1,2]):
 x=52+i*610;y=792
 a=Image.open(TEX/f'models/armor/rbow_{layer}.png').resize((256,128),Image.Resampling.NEAREST)
 for yy in range(0,128,16):
  for xx in range(0,256,16):
   d.rectangle((x+xx,y+yy,x+xx+15,y+yy+15),fill=(34,43,60) if (xx//16+yy//16)%2 else (28,35,51))
 p.paste(a,(x,y),a)
 d.text((x+273,y+9),'LAYER '+str(layer),font=f,fill=(230,235,245))
 d.text((x+273,y+43),'128 × 64 RGBA',font=sm,fill=(164,182,207))
 d.text((x+273,y+75),'Original painted panels',font=sm,fill=(164,182,207))
(ROOT/'previews').mkdir(exist_ok=True);p.save(ROOT/'previews/67_Rbow_Prismatic_Armor.png')
print('Rendered original wearable-texture preview.')
