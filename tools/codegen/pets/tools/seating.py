"""Seated haunch poses solved against an explicit y=0 contact plane.

This is an offline rig calculation, not a Minecraft renderer. Per-mount support
height is a separate client-synchronized root translation supplied by seating.js.
Standing/walking source geometry is not modified.

The solve runs in rig_math's right-handed frame. Bedrock rotates bones with the
opposite sign on X and Y: vanilla animation.cat.sit raises the chest with
body rotation [-45, 0, 0] and folds the hind legs forward with -90, so a
right-handed +45 would draw the cat nose-down. The emitted clip therefore
carries Bedrock-sign rotations; bedrock_pose/rig_pose convert between the two.
"""
from itertools import product
import numpy as np
from catalog import read
from rig_math import matrices, rotation
from seat_kinds import SEAT_KINDS

BEDROCK_ROTATION_SIGN=np.array([-1.,-1.,1.])

def bedrock_pose(pose):
    """Rig-space pose (right-handed) to the rotation signs Bedrock expects."""
    return {n:{k:(list(np.array(v,float)*BEDROCK_ROTATION_SIGN) if k=='rotation' else list(v)) for k,v in ch.items()} for n,ch in pose.items()}

def rig_pose(pose):
    """Bedrock-sign pose back to rig space for offline geometry checks."""
    return bedrock_pose(pose)

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
    """World-space cube corners for a rig-space pose."""
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
    pose=bedrock_pose(pose)
    # Stable precision makes the output deterministic across builds.
    for ch in pose.values():
        for k,v in ch.items():ch[k]=[round(float(x),8)+0.0 for x in v]
    return {'loop':True,'bones':pose}

def forward_expression(pets):
    """Molang for the seat-forward offset: per pet (variable.pet_model_id) and mount kind (pet:seat_kind).

    The catalog's `forward` is model pixels toward the nose; the model faces -z, so the clip moves pet_root by
    -forward. Pets and kinds without an offset contribute no branch, and the whole thing is 0.0 when nothing is baked.
    """
    kind="(query.has_property('pet:seat_kind') ? query.property('pet:seat_kind') : 0.0)"
    expression='0.0'
    for pet in reversed(pets):
        branches='0.0'
        for index,name in reversed(list(enumerate(SEAT_KINDS))):
            forward=pet['seating']['kinds'].get(name,{}).get('forward',0)
            if forward:branches=f"({kind} == {index} ? {round(-float(forward),8)+0.0} : {branches})"
        if branches!='0.0':expression=f"(variable.pet_model_id == {pet['wire_id']} ? {branches} : {expression})"
    return expression

def alignment_clip(pets=()):
    # These are independent roots. Only pet_root is translated; native Player bones
    # are owned exclusively by Minecraft's player animations.
    lift="query.is_riding ? (query.has_property('pet:seat_lift') ? query.property('pet:seat_lift') : 0.0) : 0.0"
    forward=forward_expression(pets)
    z=0 if forward=='0.0' else f"query.is_riding ? {forward} : 0.0"
    return {'loop':True,'bones':{'pet_root':{'position':[0,lift,z]}}}
