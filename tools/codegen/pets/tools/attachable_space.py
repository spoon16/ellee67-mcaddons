"""Attachable meshes are authored in entity space, unscaled, like the pet models they dress.

The client entity renders the player (and the pet body pass) at scripts.scale
(0.9375 in the vanilla definition). 0.5.2 pre-scaled the cats' armor meshes by
that factor on the theory that attachables rebuild their pet_* bone matrices
without the entity scale; on a device that armor drew 6% small and sank the
helmet crown into the head, while Carter's unscaled meshes fit, so the rebuilt
matrices do follow the entity scale and no mesh is pre-scaled now. The catalog
can still override the factor per pet (`equipment.armor_attachable.scale`).
"""
from copy import deepcopy
from catalog import read

def entity_scale(root):
    scale=read(root/'upstream/player.entity.json')['minecraft:client_entity']['description']['scripts']['scale']
    return float(scale)

NO_PRESCALE=1.0

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
