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

def head_fit(g,pose):
    """How the head sits against the chest in a pose: the muzzle's lead over the chest's front-most point (+z is
    back, so front is min z) and how far the chest's top reaches up into the head, both in model pixels."""
    by={b['name']:b for b in g['bones']}
    box=lambda name:(lambda pts:(pts.min(0),pts.max(0)))(transformed_vertices(g,pose,[name]))
    head_low,head_high=box('pet_head');chest_low,chest_high=box('pet_chest' if 'pet_chest' in by else 'pet_body')
    # How far the neck's front reaches into the skull (+z is back); a rig without a neck bone is never detached.
    attach=head_high[2]-box('pet_neck')[0][2] if 'pet_neck' in by else float('inf')
    return {'lead':chest_low[2]-head_low[2],'sunk':chest_high[1]-head_low[1],'attach':attach}

def head_clearance(g,pose,r):
    """The head's position offset (in its parent's frame) that keeps the rest pose's head-to-chest relation.

    The head is counter-rotated to stay upright while its parents pitch up with the body, so it swings up and back:
    the raised chest ends up in front of the muzzle and reaches up into the skull. Moving the head forward until the
    muzzle leads the chest by as much as when standing (or as far as the neck's front still reaches into the skull,
    on a short-necked rig), and up until the chest sits no deeper in it, puts the head over the front paws again.
    """
    rest=head_fit(g,{});seated=head_fit(g,pose)
    forward=min(max(0.,rest['lead']-seated['lead']),max(0.,seated['attach']));up=max(0.,seated['sunk']-rest['sunk'])
    return (r.T@np.array([0.,up,-forward])).tolist()

def neck_tuck(g):
    """The body-frame offset that parks the seated neck inside the torso, or None for a rig without a neck bone.

    The neck keeps the body's pitch (it has no channel of its own and no rest rotation), so once the head is
    counter-rotated upright and moved clear by `head_clearance`, the neck's own cube stands out behind the skull as
    a pitched wedge: 44% of its surface is exposed on Carter, 57% on the cats. Sliding it to the centre of the body
    cube hides it inside the torso whatever the head does, because both boxes carry the same rotation. The head is a
    child of the neck, and the neck has no rotation channel, so its frame is the body's and the same offset taken
    off `pet_head` leaves the head's world matrix untouched.
    """
    by={b['name']:b for b in g['bones']}
    if 'pet_neck' not in by:return None
    centre=lambda n:np.array(by[n]['cubes'][0]['origin'],float)+np.array(by[n]['cubes'][0]['size'],float)/2
    offset=centre('pet_body')-centre('pet_neck')
    offset[0]=0.
    return offset

def seated_pose(root,pet):
    """The rig-space seated pose before the neck is tucked away: what the legs, tail and head clearance solve for."""
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
    # The head, jaw, ears and mouth mount move together: the offset is on the head bone.
    pose['pet_head']['position']=head_clearance(g,pose,r)
    return g,pose

def ride_clip(root,pet):
    g,pose=seated_pose(root,pet)
    # Hide the neck inside the torso and take the same offset off the head, which is its child: the head does not move.
    offset=neck_tuck(g)
    if offset is not None:
        pose['pet_neck']={'position':offset.tolist()}
        pose['pet_head']['position']=(np.array(pose['pet_head']['position'],float)-offset).tolist()
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
