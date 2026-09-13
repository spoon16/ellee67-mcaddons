"""Sample exported animation channels for offline visual inspection and numerical tests.
This does not simulate Minecraft, transitions, networking or native item rendering.
"""
from pathlib import Path
from functools import lru_cache
import json
import numpy as np
from molang_subset import Expression
ROOT=Path(__file__).resolve().parents[1]
ANIMS=json.loads((ROOT/'resource_pack/animations/pets/carter.animation.json').read_text())['animations']
ANIMS={k.replace('animation.pet.carter.','animation.pet.'):v for k,v in ANIMS.items()}
@lru_cache(maxsize=512)
def parsed(text):return Expression(text)
def scalar(x,env):return parsed(x)(env) if isinstance(x,str) else x

def vector(value,phase,env):
    if isinstance(value,dict):
        keys=sorted((float(k),v) for k,v in value.items())
        if phase<=keys[0][0]:return vector(keys[0][1],phase,env)
        if phase>=keys[-1][0]:return vector(keys[-1][1],phase,env)
        for (a,va),(b,vb) in zip(keys,keys[1:]):
            if a<=phase<=b:
                u=(phase-a)/(b-a);return vector(va,phase,env)*(1-u)+vector(vb,phase,env)*u
    if isinstance(value,(list,tuple)):return np.array([scalar(v,env) for v in value],dtype=float)
    return np.array([scalar(value,env)]*3,dtype=float)

def updates(names,t,env=None):
    env=dict(env or {});env.setdefault('query.life_time',t)
    output={}
    for name in names:
        clip=ANIMS['animation.pet.'+name];phase=t%clip.get('animation_length',1.0)
        for bone,channels in clip['bones'].items():
            if clip.get('override_previous_animation',False):
                output[bone]={'position':np.zeros(3),'rotation':np.zeros(3),'scale':np.ones(3)}
            acc=output.setdefault(bone,{'position':np.zeros(3),'rotation':np.zeros(3),'scale':np.ones(3)})
            for ch,val in channels.items():
                v=vector(val,phase,env)
                if ch=='scale':acc[ch]*=v
                else:acc[ch]+=v
    return output

from rig_math import matrix_translation, rotation, matrices

def pose_updates(pose,t=0,attack=0,look_x=0,look_y=0,held=True):
    env={'query.life_time':t,'variable.attack_time':attack,'query.target_x_rotation':look_x,'query.target_y_rotation':look_y,
         'query.vertical_speed':2,'item_mainhand':'diamond_pickaxe' if held else ''}
    names=['grip']
    if pose!='neutral':
        names+=['secondary'] if pose!='rest' else []
        if pose in ['sneak','crawl']:names+=[pose,pose+'_walk']
        elif pose=='attack':names+=['idle','attack']
        else:names+=[pose]
        if pose!='rest':names+=['look']
    return updates(names,t,env)
