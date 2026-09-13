"""Pet-world skeleton isolation. Native hand bones are for first person only.

Pet bodies and their equipment use the already-existing, independent pet_root.
Never share root/body/head/limb names with the native Player render pass.
"""
from copy import deepcopy

def pet_world_bones(bones):
    output=[deepcopy(b) for b in bones if b['name'].startswith('pet_')]
    names={b['name'] for b in output}
    if 'pet_root' not in names:
        raise ValueError('Missing independent pet_root')
    for b in output:
        if b.get('parent') and b['parent'] not in names:
            raise ValueError('Pet bone depends on native skeleton: '+b['name'])
    return output

def validate(root, rp, pets):
    """Fail builds that let native and pet world transforms share state again.

    This validates packaged configuration, not Minecraft's implementation.
    First-person paw animation intentionally uses native hand bones and is
    explicitly outside the third-person-only isolation contract.
    """
    from catalog import read
    cs=read(rp/'render_controllers/pet_armor.render_controllers.json')['render_controllers']
    native=cs.get('controller.render.pet.armor_native',{})
    source=read(root/'upstream/native_armor_052/armor.render_controller.json')
    if {k:v for k,v in native.items() if k!='part_visibility'} != source:
        raise ValueError('Native armor must keep the fixed vanilla render path')
    if native.get('part_visibility') != [{'*':'variable.pet_fit_index == 0.0'}]:
        raise ValueError('Native armor visibility mismatch')
    for i,p in enumerate(pets,1):
        c=cs.get(f'controller.render.pet.armor_{p["id"]}',{})
        expected={**source,'geometry':f'Geometry.pet_{p["id"]}',
                  'rebuild_animation_matrices':True,
                  'part_visibility':[{'*':f'variable.pet_fit_index == {i}.0'}]}
        if c!=expected:raise ValueError('Pet armor geometry must be fixed and exclusive')
    for f in (rp/'attachables').glob('*.player.json'):
        d=read(f)['minecraft:attachable']['description']
        expected=['controller.render.pet.armor_native']+[f'controller.render.pet.armor_{p["id"]}' for p in pets]
        if d['render_controllers']!=expected or d['scripts']['animate']!=['offset',{'pet_fit':'variable.pet_fit_index > 0.0'}]:
            raise ValueError('Armor cannot disable native offset evaluation or swap native geometry')
    world_meshes=0
    for f in (rp/'models/entity/pets').rglob('*.json'):
        if f.name=='paws.geo.json':continue
        for g in read(f)['minecraft:geometry']:
            if any(not b['name'].startswith('pet_') for b in g['bones']):
                raise ValueError('Native bone in pet world mesh: '+str(f.relative_to(rp)))
            pet_world_bones(g['bones']);world_meshes+=1
    for f in (rp/'animations/pets').glob('*.json'):
        for name,a in read(f)['animations'].items():
            if any(not b.startswith('pet_') for b in a.get('bones',{})):
                raise ValueError('Pet animation writes humanoid bones: '+name)
    a=read(rp/'animations/pet_seating.animation.json')['animations']['animation.pet.seat_align']
    if set(a['bones']) != {'pet_root'}:raise ValueError('Seat lift must not translate native Player root')
    player=read(rp/'entity/player.entity.json')['minecraft:client_entity']['description']
    if player['scripts']['animate'][0] != {'root':'1.0'} or 'pet_native_reset' in player['animations']:
        raise ValueError('Stock Player animations must own the native skeleton')
    rc=read(rp/'render_controllers/player.render_controllers.json')['render_controllers']['controller.render.player.third_person']
    original=read(root/'upstream/native_armor_052/player.third_person.render_controller.json')
    if {k:v for k,v in rc.items() if k!='part_visibility'} != {k:v for k,v in original.items() if k!='part_visibility'}:
        raise ValueError('Native Player body must use fixed vanilla geometry')
    return {'status':'PASS','world_meshes_without_native_bones':world_meshes,
            'armor_adapters':len(list((rp/'attachables').glob('*.player.json'))),
            'native_armor_uses_geometry_default':True,'native_armor_matrix_rebuild_forced':False,
            'pet_world_animations_write_native_bones':False,
            'minecraft_tested':False,'scope':'Static rendering-path isolation, not client execution.'}
