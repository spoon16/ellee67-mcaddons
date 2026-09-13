"""Author the original Mochi geometry/pixel textures and reusable armor-fit sources.
No generated concept illustration is used as an atlas. All UVs refer to real pixels.
"""
from pathlib import Path
from copy import deepcopy
import math, random, json
from PIL import Image, ImageDraw
from catalog import read,write
ROOT=Path(__file__).resolve().parents[1]
FACES=['north','south','east','west','up','down']
PALETTE={'black':(39,42,45),'white':(239,237,229),'pink':(183,124,125),'nose':(103,70,74),'green':(140,165,72)}
class Atlas:
    def __init__(self): self.im=Image.new('RGBA',(128,128),(0,0,0,0));self.x=0;self.y=0;self.rh=0;self.tiles={}
    def tile(self,w,h,kind):
        key=(w,h,kind)
        if key in self.tiles:return self.tiles[key]
        if self.x+w>128:self.x=0;self.y+=self.rh+1;self.rh=0
        if self.y+h>128:raise ValueError('Atlas overflow')
        pos=[self.x,self.y];base=PALETTE.get(kind,PALETTE['black']);rng=random.Random(str(key))
        tile=Image.new('RGBA',(w,h));pix=tile.load()
        for y in range(h):
            for x in range(w):
                offset=rng.choice([-5,-2,0,0,1,3,5]);pix[x,y]=tuple(max(0,min(255,c+offset)) for c in base)+(255,)
        dr=ImageDraw.Draw(tile)
        if kind=='face':
            # Symmetric green eyes, vertical dark pupils, white blaze and cheeks.
            dr.rectangle([w//2-1,h//3,w//2,h-1],fill=PALETTE['white'])
            for x in [int(w*.18),int(w*.68)]:
                dr.rectangle([x,h//3,x+2,h//3+2],fill=PALETTE['green']);dr.rectangle([x+1,h//3,x+1,h//3+2],fill=(18,20,19));dr.point((x,h//3),fill=(255,255,245))
            dr.rectangle([w//4,h-3,3*w//4,h-1],fill=PALETTE['white'])
        if kind=='chest':
            for y in range(h):
                half=max(1,int(w*(.40-.19*y/max(h-1,1))));dr.rectangle([w//2-half,y,w//2+half,y],fill=PALETTE['white'])
        if kind=='belly':dr.rectangle([w//5,0,4*w//5,h-1],fill=PALETTE['white'])
        if kind=='ear':dr.rectangle([max(1,w//3),1,max(1,2*w//3),h-2],fill=PALETTE['pink'])
        if kind=='pads':
            dr.rectangle([w//3,h//3,2*w//3,2*h//3],fill=(136,107,105))
            for x in [w//5,2*w//5,3*w//5,4*w//5]:dr.rectangle([x,1,x,max(1,h//4)],fill=(161,124,125))
        self.im.paste(tile,tuple(pos));self.tiles[key]=pos;self.x+=w+1;self.rh=max(self.rh,h)
        return pos
    def cube(self,origin,size,kind='black',special=None):
        w,h,d=size;uv={}
        for f in FACES:
            dims=(w,h) if f in ['north','south'] else ((d,h) if f in ['east','west'] else (w,d))
            iw,ih=[max(1,int(round(n*2))) for n in dims];k=(special or {}).get(f,kind)
            uv[f]={'uv':self.tile(iw,ih,k),'uv_size':[iw,ih]}
        return {'origin':origin,'size':size,'uv':uv}

def main():
    folder=ROOT/'assets/pets/mochi';folder.mkdir(parents=True,exist_ok=True);a=Atlas()
    bones=deepcopy(read(ROOT/'catalog/rigs/native_v1.json')['bones'])
    def b(name,parent,pivot,cubes=None,rotation=None):
        obj={'name':name,'pivot':pivot}
        if parent:obj['parent']=parent
        if cubes:obj['cubes']=cubes
        if rotation:obj['rotation']=rotation
        bones.append(obj)
    c=a.cube
    b('pet_root',None,[0,0,0]);b('pet_body','pet_root',[0,8,1],[c([-2.55,4.9,-4.5],[5.1,5.4,11],special={'down':'belly','north':'chest'})])
    b('pet_chest','pet_body',[0,9,-4],[c([-2.35,6.5,-5.5],[4.7,4,2.1],special={'north':'chest'}),c([-1.25,5.4,-5.7],[2.5,2.5,.35],'white')])
    b('pet_neck','pet_body',[0,10.5,-4],[c([-2,9,-6],[4,2.5,3],'black',{'north':'chest'})])
    b('pet_head','pet_neck',[0,11.5,-5.6],[c([-3,9.5,-9],[6,5.5,5],'black',{'north':'face'})])
    b('pet_jaw','pet_head',[0,10.1,-8.8],[c([-1.8,9.2,-10],[3.6,1.8,1.7],'white'),c([-.5,10.2,-10.4],[1,.65,.5],'nose')])
    for name,sign in [('left',1),('right',-1)]:
        x=1.5 if sign>0 else -2.9
        b('pet_ear_'+name,'pet_head',[sign*2.25,14.5,-6.2],[c([x,14.5,-7.8],[1.4,2.1,1.8],'black',{'north':'ear'})])
        b('pet_ear_'+name+'_tip','pet_ear_'+name,[sign*2.25,16.3,-6.7],[c([x+.25,16.3,-7.55],[.9,.9,1.3])])
    for part,z in [('front',-3.8),('rear',4.5)]:
        for side,sign in [('left',1),('right',-1)]:
            x=sign*1.85;n='pet_'+part+'_'+side
            b(n,'pet_body',[x,5.7,z],[c([x-.8,1.3,z-.8],[1.6,4.4,1.8]),c([x-.82,.9,z-.82],[1.64,1.5,1.84],'white')])
            b(n+'_paw',n,[x,1,z],[c([x-1,0,z-1.25],[2,1.5,2.55],'white',{'down':'pads'})])
    b('pet_tail_base','pet_body',[0,8.6,6.1],[c([-.65,8,6],[1.3,1.3,4])],[-48,0,0])
    b('pet_tail_mid','pet_tail_base',[0,8.65,9.8],[c([-.55,8.1,9.8],[1.1,1.1,3.5])],[-18,0,0])
    b('pet_tail_tip','pet_tail_mid',[0,8.65,13.1],[c([-.5,8.15,13.1],[1,1,2.7])],[-18,0,0])
    b('pet_debug_mouth','pet_head',[0,10.1,-10.4],[c([-.22,9.88,-10.62],[.44,.44,.44],'green')])
    d={'format_version':'1.12.0','minecraft:geometry':[{'description':{'identifier':'geometry.pet.mochi','texture_width':128,'texture_height':128,'visible_bounds_width':4,'visible_bounds_height':4,'visible_bounds_offset':[0,1,0]},'bones':bones}]}
    write(folder/'model.geo.json',d);a.im.save(folder/'coat.png')
    # First-person paws use the same native bind frame; only the mesh silhouette/coat changes.
    pd=deepcopy(read(ROOT/'assets/pets/carter/paws.geo.json'));pd['minecraft:geometry'][0]['description']['identifier']='geometry.pet.mochi.paws';pa=Atlas()
    for bone in pd['minecraft:geometry'][0]['bones']:
        if not bone.get('cubes'):continue
        pieces=[]
        for old in bone['cubes']:
            s=old['size'];o=old['origin'];mid=o[0]+s[0]/2;s=[s[0]*.86,s[1],s[2]*.88];o=[mid-s[0]/2,o[1],-s[2]/2]
            k='black' if bone['name'] in ['leftArm','rightArm'] else 'white'
            pieces.append(pa.cube(o,s,k,{'down':'pads'} if k=='white' else {}))
        bone['cubes']=pieces
    write(folder/'paws.geo.json',pd);pa.im.save(folder/'paws.png')
    # Fit definitions use vanilla armor UV islands. They remain independent of the item material.
    for ident in ['carter','mochi']:
        model=read(ROOT/f'assets/pets/{ident}/model.geo.json')['minecraft:geometry'][0];by={b['name']:b for b in model['bones']}
        h=by['pet_head']['cubes'][0];body=by['pet_body']['cubes'][0]
        ho,hs=h['origin'],h['size'];bo,bs=body['origin'],body['size']
        slots={'helmet':[{'bone':'pet_head','origin':[ho[0]-.22,ho[1]+hs[1]-1.65,ho[2]-.22],'size':[hs[0]+.44,1.8,hs[2]+.44],'uv_region':'head'}],
               'chestplate':[{'bone':'pet_body','origin':[bo[0]-.24,bo[1]-.10,bo[2]-.10],'size':[bs[0]+.48,bs[1]+.38,bs[2]*.67],'uv_region':'body'}],
               'leggings':[], 'boots':[]}
        for part in ['front_left','front_right','rear_left','rear_right']:
            bone='pet_'+part;leg=by[bone]['cubes'][0];o,s=leg['origin'],leg['size']
            if part.startswith('rear'):
                slots['leggings'].append({'bone':bone,'origin':[o[0]-.16,o[1]+s[1]*.48,o[2]-.16],'size':[s[0]+.32,s[1]*.5+.08,s[2]+.32],'uv_region':'leg_upper'})
            pawbone=bone+'_paw';paw=by[pawbone]['cubes'][0];o,s=paw['origin'],paw['size']
            slots['boots'].append({'bone':pawbone,'origin':[o[0]-.12,o[1]+.03,o[2]-.12],'size':[s[0]+.24,s[1]+.1,s[2]+.24],'uv_region':'leg_lower'})
        slots['leggings'].insert(0,{'bone':'pet_body','origin':[bo[0]-.18,bo[1]+bs[1]-.7,bo[2]+bs[2]*.7],'size':[bs[0]+.36,.9,bs[2]*.28],'uv_region':'body'})
        write(ROOT/f'assets/pets/{ident}/armor_fit.json',{'schema_version':1,'texture_layout':'vanilla_64x32','validation':'prototype-not-engine-tested','slots':slots})
        pet=read(ROOT/f'catalog/pets/{ident}.json');pet['first_person']['default_hand_height']=2
        if ident=='mochi':pet['equipment']['mainhand']['position']=[0,10.1,-10.4]
        write(ROOT/f'catalog/pets/{ident}.json',pet)
    print('Created Mochi model, coat, paws, and both armor-fit definitions')
if __name__=='__main__':main()
