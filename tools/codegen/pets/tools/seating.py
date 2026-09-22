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

# The look clip turns the head about its own pivot on top of the ride clip, by up to 40 * 0.65 degrees of pitch and
# 55 * 0.70 of yaw (build.py writes those numbers); the seated neck has to stay inside the skull at every corner of
# that range, not only while the pet looks straight ahead.
LOOK_LIMITS=(26.,38.5)
LOOK_EXTREMES=[(x,y) for x in (-LOOK_LIMITS[0],0.,LOOK_LIMITS[0]) for y in (-LOOK_LIMITS[1],0.,LOOK_LIMITS[1])]
# How the seated neck bridges the pitched torso and the level head, per rig family, in rig-space degrees and model
# pixels: it pitches up from the body by `theta` (nose up, like the body), its cube slides `slide` toward the head
# along the neck axis and `forward` toward the nose inside the chest, and the head is then lifted along the neck by
# the least that keeps the chest out of the skull. The numbers were chosen from offline renders of the feasible set
# on 0.4.2: the head sits low on a short visible neck, the muzzle level with the chest.
NECK_BRIDGE={'spaniel':{'theta':35.,'slide':2.,'forward':1.5},'feline':{'theta':25.,'slide':0.,'forward':1.5}}
# Model pixels the torso and chest must stay below the skull's bottom plane, so the clip never z-fights the head.
SKULL_CLEARANCE=0.2
LIFT_STEP=0.05
LIFT_LIMIT=6.

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

def _updates(pose):
    return {n:{k:np.array(v,float) for k,v in ch.items()} for n,ch in pose.items()}

def transformed_vertices(g, pose, names):
    """World-space cube corners for a rig-space pose."""
    mats=matrices(g['bones'],_updates(pose))
    pts=[]
    for b in g['bones']:
        if b['name'] in names:
            for c in b.get('cubes',[]):pts.extend((mats[b['name']]@vertices(c).T).T[:,:3])
    return np.array(pts)

def _boxes(g,pose,names):
    """(bone matrix, local low corner, local high corner) for every cube of the named bones, in a rig-space pose."""
    by={b['name']:b for b in g['bones']};mats=matrices(g['bones'],_updates(pose))
    return [(mats[n],np.array(c['origin'],float),np.array(c['origin'],float)+np.array(c['size'],float)) for n in names for c in by[n].get('cubes',[])]

def _grid(lo,hi,n):
    return np.array([[x,y,z,1.] for x,y,z in product(*[np.linspace(a,b,n) for a,b in zip(lo,hi)])])

def _inside(box,points,tol=1e-6):
    m,lo,hi=box;local=(np.linalg.inv(m)@points.T).T[:,:3]
    return np.all((local>=lo-tol)&(local<=hi+tol),axis=1)

def skull(g,pose):
    """The head's skull cube (its first cube) in a pose."""
    return _boxes(g,pose,['pet_head'])[0]

def skull_intrusion(g,pose):
    """How far the torso and chest reach up into the skull, in model pixels above the skull's bottom plane, or
    -inf when nothing does. Sampled on a 9x9x9 grid per cube, which is finer than the clearance it guards."""
    box=skull(g,pose);bottom=(box[0]@_grid(box[1],box[2],2).T).T[:,1].min();deepest=-np.inf
    for torso in _boxes(g,pose,[n for n in ('pet_body','pet_chest') if any(b['name']==n for b in g['bones'])]):
        pts=(torso[0]@_grid(torso[1],torso[2],9).T).T;hit=_inside(box,pts)
        if hit.any():deepest=max(deepest,float((pts[hit][:,1]-bottom).max()))
    return deepest

def neck_corners(g,pose):
    """The neck cube's world corners in a pose."""
    box=_boxes(g,pose,['pet_neck'])[0]
    return (box[0]@_grid(box[1],box[2],2).T).T

def neck_bridges(g,pose,head_pitch):
    """Whether the neck joins torso and skull cleanly: its highest corner inside the skull for every head turn the
    look clip allows, its lowest corner inside the torso or chest, and no corner standing above the skull's bottom
    outside the skull (the 0.4.0 wedge). `head_pitch` is the head's rig-space pitch before any look."""
    corners=neck_corners(g,pose);top=corners[np.argmax(corners[:,1])];bottom=corners[np.argmin(corners[:,1])]
    box=skull(g,pose);floor=(box[0]@_grid(box[1],box[2],2).T).T[:,1].min()
    for x,y in LOOK_EXTREMES:
        turned={**pose,'pet_head':{**pose['pet_head'],'rotation':[head_pitch+x,y,0.]}}
        if not _inside(skull(g,turned),top[None])[0]:return False
    torso=_boxes(g,pose,[n for n in ('pet_body','pet_chest') if any(b['name']==n for b in g['bones'])])
    if not any(_inside(t,bottom[None])[0] for t in torso):return False
    return not any(p[1]>floor+0.3 and not _inside(box,p[None])[0] for p in corners)

def neck_bridge(g,pose,pitch,family):
    """Pitches the neck up from the body, slides it forward inside the chest, and lifts the level head along the
    neck by the least that keeps the chest out of the skull. Fails loudly when the rig no longer fits the numbers."""
    by={b['name']:b for b in g['bones']};cfg=NECK_BRIDGE[family]
    axis=np.array(by['pet_head']['pivot'],float)-np.array(by['pet_neck']['pivot'],float);axis[0]=0.;axis/=np.linalg.norm(axis)
    theta=cfg['theta'];head_pitch=-(pitch+theta)
    pose['pet_neck']={'rotation':[theta,0.,0.],'position':(axis*cfg['slide']+np.array([0.,0.,-cfg['forward']])).tolist()}
    for lift in np.arange(0.,LIFT_LIMIT+LIFT_STEP/2,LIFT_STEP):
        pose['pet_head']={'rotation':[head_pitch,0.,0.],'position':(axis*lift).tolist()}
        if skull_intrusion(g,pose)<=-SKULL_CLEARANCE:break
    else:raise ValueError(f'{family}: no head lift up to {LIFT_LIMIT} pixels keeps the chest out of the skull')
    if not neck_bridges(g,pose,head_pitch):raise ValueError(f'{family}: the seated neck does not bridge the torso and the skull; retune NECK_BRIDGE')
    return pose

def seated_pose(root,pet):
    """The rig-space seated pose: legs and tail solved against the contact plane, then the neck bridge."""
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
    # The head, jaw, ears and mouth mount move together on the head bone; the neck carries them.
    if 'pet_neck' in by:neck_bridge(g,pose,pitch,'feline' if iscat else 'spaniel')
    return g,pose

def ride_clip(root,pet):
    g,pose=seated_pose(root,pet)
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
