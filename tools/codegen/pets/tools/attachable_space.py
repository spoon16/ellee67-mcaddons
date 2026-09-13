"""Attachable meshes are authored in entity space divided by the player's render scale.

The client entity renders the player (and the pet body pass) at scripts.scale
(0.9375 in the vanilla definition). Armor and shield attachables use
rebuild_animation_matrices so their pet_* bones follow the pet skeleton, and
those rebuilt matrices are not scaled with the entity: the in-game fitted armor
drew the right shape, animated with the pet, and sat uniformly a little high,
exactly the 1/0.9375 enlargement about the feet. Pre-scaling every attachable
pivot and cube by the entity scale cancels that. Meshes drawn by the entity's
own render controllers (mouth tools, side-carry items) are not scaled.
"""
from copy import deepcopy
from catalog import read

def entity_scale(root):
    scale=read(root/'upstream/player.entity.json')['minecraft:client_entity']['description']['scripts']['scale']
    return float(scale)

def scale_bones(bones,factor):
    """Scale pivots, cube origins/sizes and inflate uniformly about the entity origin."""
    out=[]
    for bone in deepcopy(bones):
        bone['pivot']=[round(v*factor,6) for v in bone['pivot']]
        for cube in bone.get('cubes',[]):
            cube['origin']=[round(v*factor,6) for v in cube['origin']]
            cube['size']=[round(v*factor,6) for v in cube['size']]
            if 'inflate' in cube:cube['inflate']=round(cube['inflate']*factor,6)
            if 'pivot' in cube:cube['pivot']=[round(v*factor,6) for v in cube['pivot']]
        for name,offset in bone.get('locators',{}).items():
            bone['locators'][name]=[round(v*factor,6) for v in offset]
        out.append(bone)
    return out
