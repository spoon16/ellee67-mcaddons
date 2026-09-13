#!/usr/bin/env python3
"""Render the actual sleeve PNG change with a low-angle view that exposes caps.

This is a deterministic CPU UV rasterizer, not Minecraft. Boxes use the native
player armor dimensions/UVs/inflation from the pinned geometry described in
v1.1.7_sleeve_fix.json. No pixels are synthesized to improve the armor's look.
No native trim composites or player animation/skin overrides are simulated.
"""
from __future__ import annotations
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/'art/references/rbow_1.v1.1.6.png'
NEW=ROOT/'resource_pack/textures/models/armor/rbow_1.png'
BG=(12,16,26);PANEL=(25,32,46);WHITE=(238,241,250);MUTED=(165,184,207)

def font(size):
    for name in ['DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','Arial.ttf']:
        try:return ImageFont.truetype(name,size)
        except OSError:pass
    return ImageFont.load_default()

class View:
    def __init__(self,width,height,yaw,pitch,center,scale):
        self.width,self.height=width,height
        self.canvas=np.zeros((height,width,4),np.uint8)
        self.depth=np.full((height,width),-1e10)
        self.camera=np.array([math.sin(yaw)*math.cos(pitch),math.sin(pitch),math.cos(yaw)*math.cos(pitch)])
        self.right=np.array([math.cos(yaw),0,-math.sin(yaw)])
        self.up=np.cross(self.camera,self.right)
        self.center=np.array(center);self.scale=scale

    def project(self,point):
        p=np.asarray(point)-self.center
        return np.array([self.width/2+np.dot(p,self.right)*self.scale,
                         self.height/2-np.dot(p,self.up)*self.scale,
                         np.dot(p,self.camera)])

    def face(self,origin,u,v,texture,uv,normal):
        if np.dot(self.camera,normal)<=0:return
        o=self.project(origin); U=self.project(np.array(origin)+u)-o; V=self.project(np.array(origin)+v)-o
        points=np.array([o,o+U,o+U+V,o+V])
        x0=max(0,math.floor(points[:,0].min()));x1=min(self.width,math.ceil(points[:,0].max()))
        y0=max(0,math.floor(points[:,1].min()));y1=min(self.height,math.ceil(points[:,1].max()))
        if x0>=x1 or y0>=y1:return
        det=U[0]*V[1]-U[1]*V[0]
        if abs(det)<1e-8:return
        Y,X=np.mgrid[y0:y1,x0:x1];dx=X+.5-o[0];dy=Y+.5-o[1]
        s=(dx*V[1]-dy*V[0])/det;t=(U[0]*dy-U[1]*dx)/det
        valid=(s>=0)&(s<1)&(t>=0)&(t<1)
        x,y,w,h=uv
        tx=np.clip(np.floor(x+s*w).astype(int),0,texture.shape[1]-1)
        ty=np.clip(np.floor(y+t*h).astype(int),0,texture.shape[0]-1)
        rgba=texture[ty,tx].copy();z=o[2]+s*U[2]+t*V[2]
        valid &= (rgba[:,:,3]>0)&(z>self.depth[y0:y1,x0:x1])
        # Same modest preview lighting in both columns; not baked into PNGs.
        light=.84+.16*max(0,float(np.dot(normal,[-.4,.65,-.6])))
        rgba[:,:,:3]=np.rint(rgba[:,:,:3]*light).astype(np.uint8)
        self.canvas[y0:y1,x0:x1][valid]=rgba[valid];self.depth[y0:y1,x0:x1][valid]=z[valid]

    def cube(self,bounds,texture,uv=(0,0),size=(4,12,4),inflate=0):
        x0,y0,z0,x1,y1,z1=bounds
        x0-=inflate;y0-=inflate;z0-=inflate;x1+=inflate;y1+=inflate;z1+=inflate
        W,H,D=x1-x0,y1-y0,z1-z0;x,y=uv;w,h,d=size
        S=texture.shape[1]/64
        def emit(o,u,v,uvbox,n):self.face(o,np.array(u),np.array(v),texture,tuple(a*S for a in uvbox),np.array(n))
        # Front is -Z in the native model coordinate system; shared box UVs.
        emit((x1,y1,z0),(-W,0,0),(0,-H,0),(x+d,y+d,w,h),(0,0,-1))
        emit((x0,y1,z1),(W,0,0),(0,-H,0),(x+2*d+w,y+d,w,h),(0,0,1))
        emit((x0,y1,z0),(0,0,D),(0,-H,0),(x,y+d,d,h),(-1,0,0))
        emit((x1,y1,z1),(0,0,-D),(0,-H,0),(x+d+w,y+d,d,h),(1,0,0))
        emit((x1,y1,z0),(-W,0,0),(0,0,D),(x+d,y,w,d),(0,1,0))
        emit((x1,y0,z1),(-W,0,0),(0,0,-D),(x+d+w,y,w,d),(0,-1,0))

    def image(self):return Image.fromarray(self.canvas)


def render(texture,isolated=False):
    tex=np.array(Image.open(texture).convert('RGBA'))
    skin=np.zeros((64,128,4),np.uint8);skin[:]=(118,127,139,255)
    shirt=np.zeros_like(skin);shirt[:]=(57,64,78,255)
    if isolated:
        scene=View(440,430,math.pi+.52,-.43,(-6,17,0),29)
        scene.cube((-8,12,-2,-4,24,2),skin)
        scene.cube((-8,12,-2,-4,24,2),tex,(40,16),(4,12,4),1.0)
    else:
        scene=View(550,500,math.pi+.38,-.13,(0,20.8,0),18)
        scene.cube((-4,24,-4,4,32,4),skin,(0,0),(8,8,8))
        scene.cube((-4,12,-2,4,24,2),shirt,(16,16),(8,12,4))
        scene.cube((-8,12,-2,-4,24,2),skin)
        scene.cube((4,12,-2,8,24,2),skin)
        scene.cube((-4,12,-2,4,24,2),tex,(16,16),(8,12,4),1.01)
        for bounds in [(-8,12,-2,-4,24,2),(4,12,-2,8,24,2)]:scene.cube(bounds,tex,(40,16),(4,12,4),1.0)
    return scene.image()


def main():
    out=ROOT/'art/previews';out.mkdir(parents=True,exist_ok=True)
    image=Image.new('RGB',(1200,830),BG);d=ImageDraw.Draw(image)
    d.text((30,22),'67 RBOW / SLEEVE CLEANUP 1.1.7',font=font(30),fill=WHITE)
    d.text((31,66),'Actual exported textures on native-size arm boxes. Software UV render — not Minecraft.',font=font(16),fill=MUTED)
    for i,(path,title,caption) in enumerate([(OLD,'BEFORE / 1.1.6','Detached rainbow face below the exposed hand.'),(NEW,'AFTER / 1.1.7','Open cuff; no separate armor face below the hand.')]):
        x=22+i*595
        d.rounded_rectangle((x,104,x+570,761),radius=14,fill=PANEL)
        d.text((x+23,126),title,font=font(23),fill=WHITE)
        im=render(path,True);image.paste(im,(x+65,164),im)
        d.text((x+20,624),caption,font=font(18),fill=WHITE)
        # Small actual upper-body preview to show the art style/length is retained.
        little=render(path).resize((134,122),Image.Resampling.LANCZOS)
        image.paste(little,(x+412,629),little)
        d.text((x+20,661),'Same sleeve length and rainbow pixels.',font=font(16),fill=MUTED)
        d.text((x+20,687),'Only the bottom end-cap pixels are cleared.',font=font(16),fill=MUTED)
    d.text((30,785),'Shared arm UVs: this single texture correction applies to both sleeves. This view isolates the sleeve texture change.',font=font(17),fill=MUTED)
    image.save(out/'67_Rbow_Ore_Mod_v1.1.7_Sleeve_Comparison.png')
    print(out/'67_Rbow_Ore_Mod_v1.1.7_Sleeve_Comparison.png')

if __name__=='__main__':main()
