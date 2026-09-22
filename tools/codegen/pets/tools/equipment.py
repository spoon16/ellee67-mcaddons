"""Material-independent armor fitting; inventory/items are not modified.
Generated adapters are prototype visuals. Human wearers keep the native renderer.
"""
from copy import deepcopy
from catalog import read,write
from handhelds import helpers
from render_isolation import pet_world_bones
from attachable_space import NO_PRESCALE,scale_bones
# Explicit material records, rather than assumptions in runtime script.
LAYERS={'helmet':'helmet','chestplate':'chest','leggings':'leg','boots':'boot'}

def uv_region(name):
    if name in ['head_crown','head_band','body_back']:
        x,y,w,h = (8,0,8,8) if name=='head_crown' else (8,8,8,3) if name=='head_band' else (20,22,8,7)
        return {f:{'uv':[x,y],'uv_size':[w,h]} for f in ['north','south','east','west','up','down']}
    # Native armor UV islands. Pet pieces deform the SHAPE, not the material or trim item data.
    if name=='head': x,y,w,h,d=0,0,8,8,8
    elif name=='body': x,y,w,h,d=16,16,8,12,4
    elif name=='leg_upper': x,y,w,h,d=0,16,4,12,4
    else:x,y,w,h,d=0,16,4,12,4
    out={'north':{'uv':[x+d,y+d],'uv_size':[w,h]},
         'south':{'uv':[x+d+w+d,y+d],'uv_size':[w,h]},
         'west':{'uv':[x,y+d],'uv_size':[d,h]},
         'east':{'uv':[x+d+w,y+d],'uv_size':[d,h]},
         'up':{'uv':[x+d,y],'uv_size':[w,d]},
         'down':{'uv':[x+d+w,y],'uv_size':[w,d]}}
    if name=='leg_lower':
        for f in ['north','south','east','west']:out[f]['uv'][1]=26;out[f]['uv_size'][1]=6
    if name=='leg_upper':
        for f in ['north','south','east','west']:out[f]['uv_size'][1]=6
    return out

def attachable_scale(root,pet):
    """Pre-scale baked into a pet's armor meshes: none unless the catalog says otherwise for a pet."""
    return float(pet['equipment'].get('armor_attachable',{}).get('scale',NO_PRESCALE))

def fit_clip():
    """Live calibration read from the wearer: lift in model pixels and a scale about the feet."""
    lift="context.owning_entity->query.has_property('pet:armor_lift') ? context.owning_entity->query.property('pet:armor_lift') : 0.0"
    scale="context.owning_entity->query.has_property('pet:armor_scale') ? context.owning_entity->query.property('pet:armor_scale') : 1.0"
    return {'loop':True,'bones':{'pet_root':{'position':[0,lift,0],'scale':[scale,scale,scale]}}}

def generate(root,pets,rp):
    catalog=[]
    for p in pets:
        scale=attachable_scale(root,p)
        source=read(root/p['model'])['minecraft:geometry'][0]
        fit=read(root/p['equipment']['armor_fit'])
        for slot,parts in fit['slots'].items():
            skeleton=pet_world_bones(source['bones'])+helpers(p)
            for bone in skeleton:
                bone.pop('cubes',None);bone.pop('locators',None)
            for i,part in enumerate(parts):
                uv=uv_region(part['uv_region'])
                if part.get('crown_uv'):
                    x0,x1,z0,z1=part['crown_uv']['bounds']; x,_,z=part['origin'];w,_,dd=part['size']
                    for face in ['up','down']:
                        uv[face]={'uv':[8+(x-x0)/(x1-x0)*8,(z-z0)/(z1-z0)*8], 'uv_size':[w/(x1-x0)*8,dd/(z1-z0)*8]}
                skeleton.append({'name':f'pet_armor_{slot}_{i}','parent':part['bone'],'pivot':next(b['pivot'] for b in skeleton if b['name']==part['bone']),
                    'cubes':[{'origin':part['origin'],'size':part['size'],'uv':uv}]})
            write(rp/f'models/entity/pets/{p["id"]}/armor_{slot}.geo.json',{'format_version':'1.12.0','minecraft:geometry':[{
                'description':{'identifier':f'geometry.pet.{p["id"]}.armor.{slot}','texture_width':64,'texture_height':32,'visible_bounds_width':4,'visible_bounds_height':4,'visible_bounds_offset':[0,1,0]},'bones':scale_bones(skeleton,scale)}]})
    owner="query.owner_identifier == 'minecraft:player'"
    # Explicit owner context, not the local viewer. Short circuit before public variables on non-players.
    # Query actual wearer properties, not cached public render variables.
    wearer_model="(context.owning_entity->query.has_property('pet:model_id') ? context.owning_entity->query.property('pet:model_id') : 0.0)"
    index_expr='0.0'
    for i,p in reversed(list(enumerate(pets,1))):
        index_expr=f"({wearer_model} == {p['wire_id']} ? {i}.0 : {index_expr})"
    fitted=f"({owner}) && !context.is_first_person && (context.owning_entity->query.has_property('pet:armor_fit') ? context.owning_entity->query.property('pet:armor_fit') : 0.0)"
    for config in read(root/'catalog/equipment/armor_materials.json')['materials']:
        material=config['id'];shader=config['material']
        for slot,layer in LAYERS.items():
            item=config['item_template'].format(slot=slot);geometry={'default':f'geometry.player.armor.{slot}'}
            geometry.update({f'pet_{p["id"]}':f'geometry.pet.{p["id"]}.armor.{slot}' for p in pets})
            d={'identifier':config['attachable_template'].format(slot=slot),'item':{item:owner},'materials':{'default':shader,'enchanted':config['enchanted_material']},
               'textures':{'default':config['texture_template'].format(layer=2 if slot=='leggings' else 1),'enchanted':'textures/misc/enchanted_actor_glint'},
               'geometry':geometry,'scripts':{'initialize':['variable.pet_fit_index = 0.0;'],'parent_setup':f'variable.{layer}_layer_visible = 0.0;',
               'pre_animation':[f'variable.pet_fit_index = ({fitted}) ? {index_expr} : 0.0;'],
               'animate':['offset',{'pet_fit':'variable.pet_fit_index > 0.0'}]},
               'animations':{'offset':f'animation.armor.{slot}.offset','pet_fit':'animation.pet.armor_fit'},
               'render_controllers':['controller.render.pet.armor_native']+[f'controller.render.pet.armor_{p["id"]}' for p in pets]}
            write(rp/f'attachables/{material}_{slot}.player.json',{'format_version':'1.10.0','minecraft:attachable':{'description':d}})
            catalog.append({'item':item,'slot':slot,'material':material,'status':config.get('status','client-validation-required')})
    # No geometry arrays in any armor pass. The native pass always evaluates its
    # original geometry/offsets, even when its visibility is false. Pet matrices
    # are rebuilt ONLY for isolated pet_* rigs. Item materials/dye/trim/glint
    # remain in attachable context; do not synthesize or re-equip armor stacks.
    native=deepcopy(read(root/'upstream/native_armor_052/armor.render_controller.json'))
    native['part_visibility']=[{'*':'variable.pet_fit_index == 0.0'}]
    controllers={'controller.render.pet.armor_native':native}
    for i,p in enumerate(pets,1):
        fitted=deepcopy(read(root/'upstream/native_armor_052/armor.render_controller.json'))
        fitted['geometry']=f'Geometry.pet_{p["id"]}'
        fitted['rebuild_animation_matrices']=True
        fitted['part_visibility']=[{'*':f'variable.pet_fit_index == {i}.0'}]
        controllers[f'controller.render.pet.armor_{p["id"]}']=fitted
    write(rp/'render_controllers/pet_armor.render_controllers.json',{
        'format_version':'1.8.0','render_controllers':controllers})
    return catalog
