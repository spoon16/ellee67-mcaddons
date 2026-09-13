"""Seated haunch poses solved against an explicit y=0 contact plane.

This is an offline rig calculation, not a Minecraft renderer. Per-mount support
height is a separate client-synchronized root translation supplied by seating.js.
Standing/walking source geometry is not modified.
"""
from itertools import product
import numpy as np
from catalog import read
from rig_math import matrices, rotation

def vertices(c):
    a=np.array(c['origin'],float);b=a+np.array(c['size'],float)
    points=np.array([[x,y,z,1.] for x,y,z in product(*zip(a,b))])
    if c.get('rotation'):
        from rig_math import matrix_translation
        p=c.get('pivot',c['origin'])
        m=matrix_translation(p)@rotation(c['rotation'])@matrix_translation(-np.array(p))
        points=(m@points.T).T
    return points

def transformed_vertices(g, pose, names):
    mats=matrices(g['bones'],{n:{k:np.array(v,float) for k,v in ch.items()} for n,ch in pose.items()})
    pts=[]
    for b in g['bones']:
        if b['name'] in names:
            for c in b.get('cubes',[]):pts.extend((mats[b['name']]@vertices(c).T).T[:,:3])
    return np.array(pts)

def ride_clip(root,pet):
    g=read(root/pet['model'])['minecraft:geometry'][0]
    by={b['name']:b for b in g['bones']}
    iscat=pet.get('pet_kind')=='cat' or pet.get('rig','').startswith('feline')
    pitch=52.0 if iscat else 46.0
    pivot=np.array(by['pet_body']['pivot'],float)
    body=by['pet_body']['cubes'][0];a=np.array(body['origin']);size=np.array(body['size'])
    rear_contact=np.array([0.,a[1],a[2]+size[2]])
    r=rotation([pitch,0,0])[:3,:3]
    contact=pivot+r@(rear_contact-pivot)
    # Raised chest, rear body edge resting just above the contact plane.
    position=np.array([0.,0.15,2.1 if iscat else 2.4])-contact
    pose={'pet_body':{'rotation':[pitch,0.,0.],'position':position.tolist()},
          'pet_head':{'rotation':[-pitch,0.,0.]}}
    # Forelegs stay upright. Hind legs fold forward beneath the haunches;
    # each rear paw counter-rotates to rest flat instead of sticking through a seat.
    for side in ['left','right']:
        front='pet_front_'+side;rear='pet_rear_'+side
        pose[front]={'rotation':[-pitch,0.,0.],'position':[0.,0.,0.]}
        pose[front+'_paw']={'rotation':[0.,0.,0.]}
        pose[rear]={'rotation':[80.-pitch,0.,0.],'position':[0.,0.,0.]}
        pose[rear+'_paw']={'rotation':[-80.,0.,0.]}
        for leg,z,xspread in [(front,-3.0 if iscat else -3.5,0.),(rear,0.9 if iscat else 1.1,0.7 if iscat else 0.8)]:
            points=transformed_vertices(g,pose,[leg+'_paw'])
            center=(points.min(0)+points.max(0))/2
            delta=np.array([xspread*(1 if side=='left' else -1),-points[:,1].min(),z-center[2]])
            pose[leg]['position']=(r.T@delta).tolist()
    # Keep the tail above the seat rather than piercing it. Original secondary
    # tail motion can still be layered onto this seated base.
    basepitch=by['pet_tail_base'].get('rotation',[0,0,0])[0]
    pose['pet_tail_base']={'rotation':[-pitch-basepitch-5,35.,0.],'position':[0.,0.,0.]}
    for n in ['pet_tail_mid','pet_tail_tip']:
        if n in by:
            pose[n]={'rotation':[-by[n].get('rotation',[0,0,0])[0],0.,0.]}
    points=transformed_vertices(g,pose,[n for n in by if n.startswith('pet_tail')])
    if points.size and points[:,1].min()<.2:
        pose['pet_tail_base']['position']=(r.T@np.array([0.,.2-points[:,1].min(),0.])).tolist()
    # Stable precision makes the output deterministic across builds.
    for ch in pose.values():
        for k,v in ch.items():ch[k]=[round(float(x),8) for x in v]
    return {'loop':True,'bones':pose}

def alignment_clip():
    # These are independent roots. Only pet_root is translated; native Player bones
    # are owned exclusively by Minecraft's player animations.
    lift="query.is_riding ? (query.has_property('pet:seat_lift') ? query.property('pet:seat_lift') : 0.0) : 0.0"
    return {'loop':True,'bones':{'pet_root':{'position':[0,lift,0]}}}
