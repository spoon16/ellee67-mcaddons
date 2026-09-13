"""Third-person hand replacement policy and side-carried meshes.

The renderer is allowed to hide native held items only when BOTH hand slots have
an explicit replacement (or are empty). This prevents disappearing maps/mod items.
The shield's already-tested shapes and pose animation are reused, not redesigned.
"""
from __future__ import annotations
from copy import deepcopy
from catalog import read, write


def records(root):
    data = read(root / 'catalog/equipment/side_carry.json')['items']
    seen = set()
    for item in data:
        if item['id'] in seen or item['shape'] not in ('sprite', 'cube', 'stairs', 'book', 'sprite32', 'rbow_cube'):
            raise ValueError('Invalid side-carry record: ' + str(item))
        if not item['id'].startswith('minecraft:') and item['id'] != 'pet:morpher_book' and not (item['id'].startswith('elleedog:') and item.get('provider')=='rbow_1.2.0'):
            raise ValueError('This release scopes side-carry adapters to native items.')
        seen.add(item['id'])
    return data


def selector(items, slot, start=1):
    """Shallow expression tree rather than a 122-level ternary chain.

    All selection remains client-local and uses the subject's actual held stack.
    No network round trip or persisted numeric selection can display the wrong item.
    """
    def names(group):
        return ', '.join("'" + item['id'] + "'" for _, item in group)
    def branch(group):
        if not group:
            return '0.0'
        if len(group) == 1:
            i, item = group[0]
            return f"(query.is_item_name_any('{slot}', '{item['id']}') ? {i}.0 : 0.0)"
        mid = len(group) // 2
        left, right = group[:mid], group[mid:]
        return f"(query.is_item_name_any('{slot}', {names(left)}) ? {branch(left)} : {branch(right)})"
    return branch(list(enumerate(items, start)))


def add_selection(player, items):
    """The same boolean controls native hiding and every replacement render pass."""
    s = player['scripts']
    s['initialize'] += [
        'variable.pet_replace_hands = 0.0;',
        'variable.pet_carry_main_index = 0.0;',
        'variable.pet_carry_off_index = 0.0;',
    ]
    s['variables']['variable.pet_replace_hands'] = 'public'
    s['pre_animation'] += [
        f"variable.pet_carry_main_index = (variable.pet_tp && variable.pet_gear_fit && variable.pet_tool_index == 0.0 && query.get_equipped_item_name(0, 1) != '' && !query.is_item_name_any('slot.weapon.mainhand', 'minecraft:shield')) ? {selector(items, 'slot.weapon.mainhand')} : 0.0;",
        f"variable.pet_carry_off_index = (variable.pet_tp && variable.pet_gear_fit && query.get_equipped_item_name('off_hand') != '' && !query.is_item_name_any('slot.weapon.offhand', 'minecraft:shield')) ? {selector(items, 'slot.weapon.offhand')} : 0.0;",
        "variable.pet_main_shield = query.is_item_name_any('slot.weapon.mainhand', 'minecraft:shield');",
        "variable.pet_off_shield = query.is_item_name_any('slot.weapon.offhand', 'minecraft:shield');",
        "variable.pet_main_empty = query.get_equipped_item_name(0, 1) == '';",
        "variable.pet_off_empty = query.get_equipped_item_name('off_hand') == '';",
        'variable.pet_main_supported = variable.pet_main_empty || variable.pet_main_shield || variable.pet_tool_index > 0.0 || variable.pet_carry_main_index > 0.0;',
        'variable.pet_off_supported = variable.pet_off_empty || variable.pet_off_shield || variable.pet_carry_off_index > 0.0;',
        'variable.pet_replace_hands = variable.pet_tp && variable.pet_gear_fit && variable.pet_main_supported && variable.pet_off_supported;',
        'variable.pet_draw_tool = variable.pet_replace_hands && variable.pet_tool_index > 0.0;',
        # Guards must always query the currently selected item index; stale glint is never used for a different type.
        "variable.pet_carry_main_glint = (query.has_property('pet:carry_main_enchanted') && query.has_property('pet:carry_main_enchanted_for')) ? (query.property('pet:carry_main_enchanted') && query.property('pet:carry_main_enchanted_for') == variable.pet_carry_main_index) : 0.0;",
        "variable.pet_carry_off_glint = (query.has_property('pet:carry_off_enchanted') && query.has_property('pet:carry_off_enchanted_for')) ? (query.property('pet:carry_off_enchanted') && query.property('pet:carry_off_enchanted_for') == variable.pet_carry_off_index) : 0.0;",
        "variable.pet_main_shield_glint = query.has_property('pet:main_shield_enchanted') ? query.property('pet:main_shield_enchanted') : 0.0;",
        "variable.pet_off_shield_glint = query.has_property('pet:off_shield_enchanted') ? query.property('pet:off_shield_enchanted') : 0.0;",
    ]
    # Added to native client entities in Bedrock 26.30. Crucially, this is not bone scaling.
    s['hide_held_items'] = 'variable.pet_replace_hands'


def side_mesh(root, pet, hand, shape):
    from handhelds import skeleton, geom, FACES
    cfg = pet['equipment']['side_carry']
    sign = 1 if hand == 'main' else -1  # Profile main-hand X is negative, opposite the offhand shield.
    point = list(cfg['sprite_position'] if shape in ('sprite','book','sprite32') else cfg['cube_position'])
    point[0] *= sign
    x0, y0, z0 = point
    cubes = []
    if shape in ('sprite','sprite32'):
        res=32 if shape=='sprite32' else 16
        scale, depth = cfg['pixel_scale']*16/res, cfg['sprite_thickness']
        for y in range(res):
            for x in range(res):
                # Plane is parallel to the pet's flank; no inherited hand rotation or head look.
                cubes.append({
                    'origin': [x0-depth/2, y0+(res/2-1-y)*scale, z0+(x-res/2)*scale],
                    'size': [depth, scale, scale],
                    'uv': {face: {'uv': [x, y], 'uv_size': [1, 1]} for face in FACES},
                })
    elif shape == 'book':
        # One transparent, high-resolution icon plane, not 16x16 repeated texels.
        edge=16*cfg['pixel_scale'];depth=cfg['sprite_thickness']
        uv={f:{'uv':[0,0],'uv_size':[1,1]} for f in FACES}
        uv['east']={'uv':[0,0],'uv_size':[128,128]}
        uv['west']={'uv':[128,0],'uv_size':[-128,128]}
        cubes=[{'origin':[x0-depth/2,y0-edge/2,z0-edge/2],'size':[depth,edge,edge],'uv':uv}]
    elif shape == 'rbow_cube':
        size=cfg['cube_size']
        uv={face:{'uv':[0,0],'uv_size':[32,32]} for face in FACES}
        for face in ['up','down']:uv[face]={'uv':[32,0],'uv_size':[32,32]}
        cubes=[{'origin':[v-size/2 for v in point],'size':[size]*3,'uv':uv}]
    elif shape == 'stairs':
        size=cfg['cube_size'];x,y,z=[v-size/2 for v in point]
        cubes=[{'origin':[x,y,z],'size':[size,size/2,size],
                'uv':{f:{'uv':[0,0],'uv_size':[16,16]} for f in FACES}},
               {'origin':[x,y+size/2,z+size/2],'size':[size,size/2,size/2],
                'uv':{f:{'uv':[0,0],'uv_size':[16,16]} for f in FACES}}]
    else:
        size = cfg['cube_size']
        cubes = [{'origin': [v-size/2 for v in point], 'size': [size]*3,
                  'uv': {face: {'uv': [0, 0], 'uv_size': [16, 16]} for face in FACES}}]
    # This directly follows the proven torso animation, not the native arm chain.
    bones = skeleton(pet, root)
    bones.append({'name': f'pet_carry_{hand}', 'parent': 'pet_body', 'pivot': point, 'cubes': cubes})
    dims={'book':(128,128),'sprite32':(32,32),'rbow_cube':(64,32)}.get(shape,(16,16))
    return geom(f'geometry.pet.{pet["id"]}.carry.{hand}.{shape}', bones,*dims)


def generate(root, pets, rp, player):
    items = records(root)
    add_selection(player, items)
    output = {}
    d = player
    for n, item in enumerate(items, 1):
        d['textures'][f'pet_carry_{n}'] = item['texture']
    d['textures']['pet_shield'] = 'textures/entity/shield'
    d['textures']['pet_shield_glint'] = 'textures/misc/enchanted_item_glint'
    d['materials']['pet_shield'] = 'entity_alphatest'
    d['materials']['pet_shield_glint'] = 'entity_alphatest_glint'
    tex = ['Texture.pet_carry_1'] + [f'Texture.pet_carry_{i}' for i in range(1, len(items)+1)]
    for pet in pets:
        ident, wire = pet['id'], pet['wire_id']
        for hand in ['main', 'off']:
            for shape in ['sprite', 'cube', 'stairs', 'book', 'sprite32', 'rbow_cube']:
                key = f'pet_{ident}_carry_{hand}_{shape}'
                d['geometry'][key] = f'geometry.pet.{ident}.carry.{hand}.{shape}'
                write(rp / f'models/entity/pets/{ident}/carry_{hand}_{shape}.geo.json', side_mesh(root, pet, hand, shape))
            geos = [f'Geometry.pet_{ident}_carry_{hand}_sprite'] + [f'Geometry.pet_{ident}_carry_{hand}_{item["shape"]}' for item in items]
            name = f'controller.render.pet.{ident}.carry_{hand}'
            output[name] = {
                'rebuild_animation_matrices': True,
                'arrays': {'geometries': {'Array.carry': geos}, 'textures': {'Array.carry': tex}},
                'geometry': f'Array.carry[variable.pet_carry_{hand}_index]',
                'materials': [{'*': f'variable.pet_carry_{hand}_glint ? Material.pet_tool_glint : Material.pet_tool'}],
                'textures': [f'Array.carry[variable.pet_carry_{hand}_index]', 'Texture.pet_tool_glint'],
            }
            d['render_controllers'].append({name: f'variable.pet_replace_hands && variable.pet_model_id == {wire} && variable.pet_carry_{hand}_index > 0.0'})
            # Reuse EXACTLY the already-tested pet shield mesh and shield_pose animation.
            side = 'right' if hand == 'main' else 'left'
            alias = f'pet_{ident}_shield_{hand}'
            d['geometry'][alias] = f'geometry.pet.{ident}.shield.{side}'
            name = f'controller.render.pet.{ident}.shield_{hand}_replacement'
            output[name] = {
                'rebuild_animation_matrices': True, 'geometry': 'Geometry.'+alias,
                'materials': [{'*': f'variable.pet_{hand}_shield_glint ? Material.pet_shield_glint : Material.pet_shield'}],
                'textures': ['Texture.pet_shield', 'Texture.pet_shield_glint'],
            }
            d['render_controllers'].append({name: f'variable.pet_replace_hands && variable.pet_model_id == {wire} && variable.pet_{hand}_shield'})
    write(rp/'render_controllers/pet_carry.render_controllers.json', {'format_version':'1.8.0','render_controllers':output})
    # Belt and braces: if an engine uses another shield attachable path, its explicit condition
    # still suppresses that old mesh while the player-level replacement is active.
    shield = read(rp/'attachables/shield.entity.json')
    sh = shield['minecraft:attachable']['description']
    suppressed = "(query.owner_identifier == 'minecraft:player' && !context.is_first_person && context.owning_entity->variable.pet_replace_hands)"
    sh['render_controllers'] = [{name: f'({condition}) && !{suppressed}' for name, condition in row.items()} for row in sh['render_controllers']]
    write(rp/'attachables/shield.entity.json', shield)
    return items
