"""Pet-local held-item presentation.

Known ordinary tools are drawn from their native 16x16 item textures on an explicit
mouth-attached mesh. Engine-level held-item suppression is installed by carrying.py.
First person, Human form, unmapped items, and actual equipment stacks are untouched.
Shield fitting uses the same inherited skeleton approach as the validated armor.
This is visual fitting, NOT altered hitboxes/projectile origins/blocking mechanics.
"""
from copy import deepcopy
import math
from catalog import read, write
from render_isolation import pet_world_bones

FACES=('north','south','east','west','up','down')

def helpers(pet):
    e=pet['equipment'];mouth=e['mouth_sprite'];s=e['shield']
    return [
      {'name':'pet_tool_mount','parent':'pet_head','pivot':mouth['position'],'rotation':mouth['rotation']},
      {'name':'pet_shield_left','parent':'pet_body','pivot':s['side_position']},
      {'name':'pet_shield_right','parent':'pet_body','pivot':[-s['side_position'][0],*s['side_position'][1:]]},
    ]

def skeleton(pet,root):
    bones=pet_world_bones(read(root/pet['model'])['minecraft:geometry'][0]['bones'])
    for b in bones:b.pop('cubes',None);b.pop('locators',None)
    return bones+helpers(pet)

def geom(ident,bones,w=16,h=16):
    return {'format_version':'1.12.0','minecraft:geometry':[{'description':{
      'identifier':ident,'texture_width':w,'texture_height':h,
      'visible_bounds_width':5,'visible_bounds_height':4,'visible_bounds_offset':[0,1,0]},'bones':bones}]}

def sprite_mesh(root,pet,item):
    """Each texel is a tiny cube: native alpha defines its silhouette, including texture packs.
    A full 16x16 grid avoids assuming every material has diamond's exact pixel outline.
    256 cuboids share ONE mesh bone; only one selected-tool mesh is rendered.
    """
    cfg=pet['equipment']['mouth_sprite'];m=cfg['position'];res=item.get('pixel_resolution',16)
    if res not in (16,32):raise ValueError('Unsupported held-texture resolution')
    s=cfg['pixel_scale']*(16/res)*item.get('visual_scale',1.0);d=cfg['thickness']*cfg['pixel_scale'];gx,gy=item['grip_pixel']
    alpha=None
    if item.get('prune_transparent'):
        from PIL import Image
        with Image.open(root/item['source_texture']) as im:
            if im.size!=(res,res):raise ValueError('Held texture size mismatch: '+item['id'])
            alpha=im.convert('RGBA').getchannel('A').copy()
    cubes=[]
    for y in range(res):
        for x in range(res):
            if alpha is not None and alpha.getpixel((x,y))<=127:continue
            # The old bind-pose Z rotation rendered the handle vertically in Bedrock.
            # Bake the intended horizontal silhouette into vertex-space positions.
            # A square texel has the same outline at +45 and -45 degrees, so the
            # per-texel bevel rotation does not reintroduce that handedness ambiguity.
            angle=math.radians(item.get('bake_pixel_rotation_z', cfg.get('bake_pixel_rotation_z', -45)))
            cx,cy=(x-gx+.5)*s,(gy-y-.5)*s
            center=[m[0]+cx*math.cos(angle)-cy*math.sin(angle),
                    m[1]+cx*math.sin(angle)+cy*math.cos(angle),m[2]]
            cubes.append({'origin':[center[0]-s/2,center[1]-s/2,center[2]-d/2],
                'size':[s,s,d], 'pivot':center, 'rotation':[0,0,45],
                'uv':{face:{'uv':[x,y],'uv_size':[1,1]} for face in FACES}})
    bones=skeleton(pet,root)+[{'name':'pet_tool_pixels','parent':'pet_tool_mount','pivot':m,'cubes':cubes}]
    return geom(f'geometry.pet.{pet["id"]}.tool.{item["shape"]}',bones,res,res)

def box_uv(x,y,w,h,d):
    return {'north':{'uv':[x+d,y+d],'uv_size':[w,h]},'south':{'uv':[x+2*d+w,y+d],'uv_size':[w,h]},
        'west':{'uv':[x,y+d],'uv_size':[d,h]},'east':{'uv':[x+d+w,y+d],'uv_size':[d,h]},
        'up':{'uv':[x+d,y],'uv_size':[w,d]},'down':{'uv':[x+d+w,y],'uv_size':[w,d]}}

def shield_mesh(root,pet,side):
    cfg=pet['equipment']['shield'];sign=1 if side=='left' else -1
    point=[cfg['side_position'][0]*sign,*cfg['side_position'][1:]]
    width,height,depth=cfg['width'],cfg['height'],cfg['depth']
    x,y,z=point
    cubes=[{'origin':[x-width/2,y-height/2,z-depth/2],'size':[width,height,depth], 'uv':box_uv(0,0,12,22,1)},
       {'origin':[x-width/12,y-height*.12,z+depth/2], 'size':[width/6,height*.24,depth*2.8], 'uv':box_uv(26,0,2,6,6)}]
    bones=skeleton(pet,root)+[{'name':'pet_shield_plate','parent':'pet_shield_'+side,'pivot':point,'cubes':cubes}]
    return geom(f'geometry.pet.{pet["id"]}.shield.{side}',bones,64,64)

def pose(pet):
    s=pet['equipment']['shield'];b='variable.pet_guard_blend';bones={}
    for side,sign in [('left',1),('right',-1)]:
        resting=[sign*s['side_position'][0],*s['side_position'][1:]]
        front=[sign*s['front_position'][0],*s['front_position'][1:]]
        # Small lateral split only when two shields are actually equipped.
        both="(query.is_item_name_any('slot.weapon.mainhand', 'minecraft:shield') && query.is_item_name_any('slot.weapon.offhand', 'minecraft:shield'))"
        pos=[f'{front[i]-resting[i]:.8f} * {b}' for i in range(3)]
        pos[0]=f'({front[0]-resting[0]:.8f} + ({both} ? {sign*2.2} : 0.0)) * {b}'
        rest=list(s['side_rotation']);rest[1]*=sign
        rot=[f'{rest[i]} + ({s["front_rotation"][i]-rest[i]}) * {b}' for i in range(3)]
        bones['pet_shield_'+side]={'position':pos,'rotation':rot,'scale':[1,1,1]}
    return {'loop':True,'bones':bones}

def generate(root,pets,rp,player):
    records=read(root/'catalog/equipment/handhelds.json')['items'];scripts=player['scripts'];aliases=player['geometry'];textures=player['textures']
    # No saved index: both BP and RP generate from the same item table on each build.
    expr='0.0'
    for i,item in reversed(list(enumerate(records,1))):
        expr=f"(query.is_item_name_any('slot.weapon.mainhand', '{item['id']}') ? {i}.0 : {expr})"
    scripts['initialize'] += ['variable.pet_guard_blend = 0.0;']
    scripts['pre_animation'] += [
       f'variable.pet_tool_index = {expr};',
       "variable.pet_gear_fit = query.has_property('pet:gear_fit') ? query.property('pet:gear_fit') : 1.0;",
       "variable.pet_guard_blend = variable.pet_tp ? math.lerp(variable.pet_guard_blend, (query.is_sneaking || query.blocking) ? 1.0 : 0.0, math.clamp(query.delta_time / 0.16, 0.0, 1.0)) : 0.0;",
       "variable.pet_tool_glint = (query.has_property('pet:tool_enchanted') && query.has_property('pet:tool_enchanted_for')) ? (query.property('pet:tool_enchanted') && query.property('pet:tool_enchanted_for') == variable.pet_tool_index) : 0.0;",
    ]
    scripts['variables']['variable.pet_gear_fit']='public'
    player['materials']['pet_tool']='entity_alphatest';player['materials']['pet_tool_glint']='entity_alphatest_glint'
    textures['pet_tool_glint']='textures/misc/enchanted_item_glint'
    shapes={item['shape']:item for item in records}
    renders={}
    for pet in pets:
        ident=pet['id']
        for shape,item in shapes.items():
            path=f'models/entity/pets/{ident}/tool_{shape}.geo.json'
            write(rp/path,sprite_mesh(root,pet,item));aliases[f'pet_{ident}_tool_{shape}']=f'geometry.pet.{ident}.tool.{shape}'
        ga=['Geometry.pet_'+ident+'_tool_'+records[0]['shape']]+['Geometry.pet_'+ident+'_tool_'+i['shape'] for i in records]
        tex=[]
        for idx,item in enumerate(records,1):
            alias=f'pet_tool_{idx}';textures[alias]=item['texture'];tex.append('Texture.'+alias)
        tex=[tex[0]]+tex
        rc=f'controller.render.pet.{ident}.mouth_tool'
        renders[rc]={'rebuild_animation_matrices':True,'arrays':{'geometries':{'Array.tools':ga},'textures':{'Array.tool_textures':tex}},
           'geometry':'Array.tools[variable.pet_tool_index]','materials':[{'*':'variable.pet_tool_glint ? Material.pet_tool_glint : Material.pet_tool'}],
           'textures':['Array.tool_textures[variable.pet_tool_index]','Texture.pet_tool_glint']}
        player['render_controllers'].append({rc:f'variable.pet_draw_tool && variable.pet_model_id == {pet["wire_id"]}'})
        for side in ['left','right']:write(rp/f'models/entity/pets/{ident}/shield_{side}.geo.json',shield_mesh(root,pet,side))
    # Do not collapse native arm/item bones. The dedicated held-item visibility
    # control in carrying.py suppresses both native slots only when replacements exist.
    write(rp/'render_controllers/pet_tools.render_controllers.json',{'format_version':'1.8.0','render_controllers':renders})
    # Shield: leave native item, native shader, banner/glint inputs and FP animation intact.
    sh=read(root/'upstream/shield.entity.json');d=sh['minecraft:attachable']['description']
    index='0.0'
    for i,p in reversed(list(enumerate(pets,1))):index=f"(context.owning_entity->variable.pet_model_id == {p['wire_id']} ? {i}.0 : {index})"
    gate="query.owner_identifier == 'minecraft:player' && !context.is_first_person && (context.owning_entity->variable.pet_gear_fit)"
    d['scripts']['pre_animation'].append(f'variable.pet_shield_index = ({gate}) ? {index} : 0.0;')
    d['scripts']['animate']=[{'wield':'variable.pet_shield_index == 0.0'}]
    for p in pets:
        for side in ['left','right']:d['geometry'][f'pet_{p["id"]}_{side}']=f'geometry.pet.{p["id"]}.shield.{side}'
    d['render_controllers']=[{'controller.render.item_default':'variable.pet_shield_index == 0.0'},
       {'controller.render.pet.shield':'variable.pet_shield_index > 0.0'}]
    write(rp/'attachables/shield.entity.json',sh)
    arrays={side:['Geometry.default']+[f'Geometry.pet_{p["id"]}_{side}' for p in pets] for side in ['left','right']}
    write(rp/'render_controllers/pet_shield.render_controllers.json',{'format_version':'1.8.0','render_controllers':{
      'controller.render.pet.shield':{'rebuild_animation_matrices':True,
       'arrays':{'geometries':{'Array.shield_left':arrays['left'],'Array.shield_right':arrays['right']}},
       'geometry':"context.item_slot == 'off_hand' ? Array.shield_left[variable.pet_shield_index] : Array.shield_right[variable.pet_shield_index]",
       'materials':[{'*':'variable.is_enchanted ? Material.enchanted : Material.default'}],
       'textures':['Texture.default','Texture.enchanted']}}})
    return [{'item':i['id'],'texture':i['texture'],'status':'implemented-awaiting-client-validation'} for i in records]
