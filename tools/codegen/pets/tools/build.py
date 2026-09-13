"""Offline, deterministic compiler for ElleeDog 67 Pets.
Inputs: catalog + per-pet assets + pinned vanilla/0.2.1 baseline.
Generated outputs are never edited by hand. No network is used by this builder.
"""
from __future__ import annotations
from pathlib import Path
from copy import deepcopy
import argparse, hashlib, json, shutil, zipfile, math
from PIL import Image, ImageDraw
from catalog import read,write,load_catalog
from equipment import generate as equipment
from render_isolation import pet_world_bones, validate as validate_render_isolation
import handhelds
import carrying
from branding import prepare_icon
from morpher_assets import generate as morpher_assets
import rbow_compat
from load_validation import validate_behavior_pack
import seating
from equipment import fit_clip as armor_fit_clip

ROOT=Path(__file__).resolve().parents[1]
OLD_SELECT="(query.has_property('pet:form') ? (query.property('pet:form') == 'carter') : 0.0)"
DEBUG="(query.has_property('pet:debug') ? query.property('pet:debug') : 0.0)"
EMPTY="query.get_equipped_item_name(0, 1) == ''"

def mapped(value,fn):
    if isinstance(value,str):return fn(value)
    if isinstance(value,list):return [mapped(x,fn) for x in value]
    if isinstance(value,dict):return {fn(k):mapped(v,fn) for k,v in value.items()}
    return value

def scaled(v,s):
    if s==1:return deepcopy(v)
    if isinstance(v,(int,float)):return v*s
    if isinstance(v,str):return f'({v}) * {s}'
    if isinstance(v,list):return [scaled(x,s) for x in v]
    if isinstance(v,dict):return {k:scaled(x,s) for k,x in v.items()}
    raise TypeError(v)

def animation(bones,override=False):
    d={'loop':True,'bones':bones}
    if override:d['override_previous_animation']=True
    return d

def reset(pos=(0,0,0),rot=(0,0,0)):
    return {'position':list(pos),'rotation':list(rot),'scale':[1,1,1]}

def mul_rot(v,degrees):
    import numpy as np
    x,y,z=np.radians(degrees);cx,cy,cz=np.cos([x,y,z]);sx,sy,sz=np.sin([x,y,z])
    matrix=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
    return matrix@np.array(v)

def grip_for(root,pet):
    # Mouth tools have been parented directly to pet_head since 0.3.1. Moving
    # native root/body/rightArm as a second grip path is obsolete and can move
    # humanoid armor. Keep only the original visible jaw channel.
    return animation({'pet_jaw':{'rotation':[
        "query.get_equipped_item_name(0, 1) != '' ? 4.0 : 0.0",0,0]}},True)

def generate_animations(root,pet,rp):
    ident=pet['id'];raw=read(root/'catalog/rigs/quadruped_clips.json')['animations'];clips={}
    scales=pet['rig_definition']['scales']
    common={'fp_swap','fp_lift','paw_flex'}
    for full,source in raw.items():
        name=full.split('animation.pet.',1)[1]
        if name in common:continue
        clip=deepcopy(source)
        if name=='grip':clip=grip_for(root,pet)
        elif name=='ride':clip=seating.ride_clip(root,pet)
        else:
            for bone,channels in clip['bones'].items():
                factor=scales['ear_swing'] if bone.startswith('pet_ear') else scales['tail_swing'] if bone.startswith('pet_tail') else scales['gait'] if any(bone.startswith('pet_'+s) for s in ['front','rear']) else 1
                for channel in ['rotation','position']:
                    if channel in channels:channels[channel]=scaled(channels[channel],factor)
            if 'anim_time_update' in clip and scales['stride_clock']!=1:clip['anim_time_update']=f"({clip['anim_time_update']}) * {scales['stride_clock']}"
        # Source clips include legacy native companion channels. They are not
        # necessary for direct pet-head/body attachments; strip only those.
        clip['bones']={n:ch for n,ch in clip['bones'].items() if n.startswith('pet_')}
        clips[f'animation.pet.{ident}.{name}']=clip
    clips[f'animation.pet.{ident}.shield_pose']=handhelds.pose(pet)
    # Articulation of an optional extra tail joint is rig configuration, not core behavior.
    if any(b['name']=='pet_tail_mid' for b in read(root/pet['model'])['minecraft:geometry'][0]['bones']):
        clips[f'animation.pet.{ident}.secondary']['bones']['pet_tail_mid']={'rotation':[0,'math.sin(query.life_time * 105.0 + 25.0) * 5.0',0]}
    controller=read(root/'catalog/rigs/quadruped_states.json')
    controller=mapped(controller,lambda v:v.replace('controller.animation.pet.locomotion',f'controller.animation.pet.{ident}.locomotion').replace('pet_',f'pet_{ident}_') if not v.startswith('query.') else v)
    # The controller identifier contains dots, not pet_ aliases; expression text is left intact.
    write(rp/f'animations/pets/{ident}.animation.json',{'format_version':'1.8.0','animations':clips})
    write(rp/f'animation_controllers/pets/{ident}.animation_controllers.json',controller)
    return clips

GLYPHS={'0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],
'3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],'6':['111','100','111','101','111'],
'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
'P':['110','101','110','100','100'],'C':['111','100','100','100','111'],'D':['110','101','101','101','110'],'M':['101','111','111','101','101'],'R':['110','101','110','101','101'],'V':['101','101','101','101','010'],'.':['0','0','0','0','1']}
def pixels(draw,text,x,y,scale,color):
    for letter in text:
        grid=GLYPHS.get(letter,GLYPHS['0']);width=len(grid[0])
        for yy,line in enumerate(grid):
            for xx,c in enumerate(line):
                if c=='1':draw.rectangle([x+xx*scale,y+yy*scale,x+(xx+1)*scale-1,y+(yy+1)*scale-1],fill=color)
        x+=(width+1)*scale

def badge(path,label,color,version_text='0.5.2'):
    im=Image.new('RGBA',(64,64),color);d=ImageDraw.Draw(im);d.rectangle([1,1,62,62],outline=(235,242,237),width=2)
    scale=3 if len(label)>2 else 4;left=(64-(4*len(label)-1)*scale)//2
    pixels(d,label,left,7,scale,(255,255,245));d.line([5,35,58,35],fill=(235,242,237),width=1);pixels(d,version_text,10,43,2,(255,255,245));path.parent.mkdir(parents=True,exist_ok=True);im.save(path)

def zip_dir(root,output):
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(root.rglob('*')):
            if not p.is_file():continue
            info=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,9,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,p.read_bytes())

def build(root=ROOT,output=None):
    root=Path(root).resolve();out=Path(output or root).resolve();project,pets,ids=load_catalog(root);version=project['version']
    version_str='.'.join(map(str,version)); release_label=project.get('release_label','').strip();
    prepare_icon(root)
    registry=[{k:v for k,v in p.items() if k!='rig_definition'} for p in pets]
    for d in registry:d['menu_icon']=f"textures/ui/pets/{d['id']}"
    catalog_hash=hashlib.sha256(json.dumps(registry,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    script='// GENERATED from catalog/pets; edit the catalog, not this module.\n'
    for name,val in [('BUILD',project['build']),('RELEASE_VERSION','.'.join(map(str,version))),('CATALOG_HASH',catalog_hash),('MAX_WIRE_ID',project['max_wire_id']),('DEFAULT_HAND_HEIGHT',2)]:script+=f'export const {name} = '+json.dumps(val)+';\n'
    script+='export const PETS = Object.freeze('+json.dumps(registry,indent=2)+'.map(p => Object.freeze(p)));\n'
    items=read(root/'catalog/equipment/handhelds.json')['items']
    side_items=carrying.records(root)
    script+='export const SIDE_CARRY_INDEX = Object.freeze('+json.dumps({i['id']:n for n,i in enumerate(side_items,1)})+');\n'
    script+='export const HANDHELD_INDEX = Object.freeze('+json.dumps({i['id']:n for n,i in enumerate(items,1)})+');\n'
    script+='export const MODEL_BY_ID = Object.freeze(Object.fromEntries(PETS.map(p => [p.id,p])));\nexport const MODEL_BY_WIRE = Object.freeze(Object.fromEntries(PETS.map(p => [p.wire_id,p])));\n'
    # Updating generated test input is explicit, also when building to an alternate output.
    (root/'src/catalog.generated.js').write_text(script)
    base=root/'baseline/0.2.1'
    for rel,expected in read(base/'SHA256.json').items():
        if hashlib.sha256((base/rel).read_bytes()).hexdigest()!=expected:raise ValueError('Baseline modified: '+rel)
    bp=out/'behavior_pack';rp=out/'resource_pack'
    for target in [bp,rp]:
        if target.exists():shutil.rmtree(target)
        shutil.copytree(base/target.name,target)
    for target in [rp/'models/entity',rp/'animations',rp/'animation_controllers',rp/'render_controllers',rp/'attachables',rp/'textures/entity/carter']:
        if target.exists():shutil.rmtree(target)
    shutil.copytree(root/'src',bp/'scripts',dirs_exist_ok=True)
    # The inherited 1.20 recipe omitted mandatory unlock data.
    recipe=read(bp/'recipes/paw_token.json')
    recipe['minecraft:recipe_shapeless']['unlock']=[{'item':'minecraft:bone'}]
    write(bp/'recipes/paw_token.json',recipe)
    for folder in [bp,rp]:
        m=read(folder/'manifest.json');m['header']['name']=f'ElleeDog 67 Pets {version_str} — {release_label} {"BP" if folder==bp else "RP"}'
        m['header']['description']='Isolated native Player armor and pet render skeletons. Rbow 1.2.3 companion; Rbow 1.2.0 gameplay retained. Quiet startup. Client validation pending.'
        m['header']['version']=version;m['header']['min_engine_version']=project['minimum_engine']
        for module in m['modules']:module['version']=version
        for dep in m.get('dependencies',[]):
            if 'uuid' in dep:dep['version']=version
        write(folder/'manifest.json',m);shutil.copy2(root/'assets/shared/pack_icon.png',folder/'pack_icon.png')
    pd=read(bp/'entities/player.json');desc=pd['minecraft:entity']['description'];desc['properties'].pop('pet:form',None)
    desc['properties']['pet:model_id']={'type':'int','range':[0,project['max_wire_id']],'default':0,'client_sync':True}
    desc['properties']['pet:hand_height']['default']=0
    desc['properties']['pet:view']['default']='native'
    desc['properties']['pet:motion']['default']=False
    desc['properties']['pet:armor_fit']={'type':'bool','default':False,'client_sync':True}
    desc['properties']['pet:gear_fit']={'type':'bool','default':False,'client_sync':True}
    desc['properties']['pet:tool_enchanted']={'type':'bool','default':False,'client_sync':True}
    desc['properties']['pet:tool_enchanted_for']={'type':'int','range':[0,4095],'default':0,'client_sync':True}
    for hand in ['main','off']:
        desc['properties'][f'pet:carry_{hand}_enchanted']={'type':'bool','default':False,'client_sync':True}
        desc['properties'][f'pet:carry_{hand}_enchanted_for']={'type':'int','range':[0,4095],'default':0,'client_sync':True}
        desc['properties'][f'pet:{hand}_shield_enchanted']={'type':'bool','default':False,'client_sync':True}
    desc['properties']['pet:seat_lift']={'type':'float','range':[-64.0,64.0],'default':0.0,'client_sync':True}
    desc['properties']['pet:seat_kind']={'type':'int','range':[0,4],'default':0,'client_sync':True}
    # Live calibration of the fitted armor attachables: the wearer's armor meshes are lifted by pet:armor_lift model
    # pixels and scaled by pet:armor_scale about the feet, on top of the per-pet pre-scale baked into the geometry.
    desc['properties']['pet:armor_lift']={'type':'float','range':[-16.0,16.0],'default':0.0,'client_sync':True}
    desc['properties']['pet:armor_scale']={'type':'float','range':[0.5,1.5],'default':1.0,'client_sync':True}
    for name,model in [('pet:become_human',0),('pet:become_carter',1)]:
        pd['minecraft:entity']['events'][name]={'set_property':{
            'pet:model_id':model,'pet:view':'paws' if model else 'native',
            'pet:motion':bool(model),'pet:armor_fit':bool(model),'pet:gear_fit':bool(model),
            'pet:hand_height':2 if model else 0,'pet:seat_lift':0.0,'pet:seat_kind':0,
            'pet:armor_lift':0.0,'pet:armor_scale':1.0}}
    if len(desc['properties']) > 32: raise ValueError('Player property budget exceeded')
    # Generate the diagnostic contract from the same definitions shipped to Minecraft.
    schema={k:v for k,v in desc['properties'].items() if k.startswith('pet:')}
    schema_hash=hashlib.sha256(json.dumps(schema,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    schema_js='// GENERATED diagnostic contract, not property registration.\n'
    schema_js+='export const PROPERTY_SCHEMA_SHA256 = '+json.dumps(schema_hash)+';\n'
    schema_js+='export const PROPERTY_SCHEMA = Object.freeze('+json.dumps(schema,indent=2)+');\n'
    (root/'src/property_schema.generated.js').write_text(schema_js)
    (bp/'scripts/property_schema.generated.js').write_text(schema_js)
    write(bp/'entities/player.json',pd)
    probe=read(bp/'entities/diag_model.json');probe['minecraft:entity']['description']['properties']={'pet:model_id':deepcopy(desc['properties']['pet:model_id'])}
    write(bp/'entities/diag_model.json',probe)
    # Build a compact lookup table. Permanent IDs may be sparse; array positions are NEVER saved.
    getter="(query.has_property('pet:model_id') ? query.property('pet:model_id') : 0.0)"
    index='0.0'
    for i,p in reversed(list(enumerate(pets,1))):index=f"({getter} == {p['wire_id']} ? {i}.0 : {index})"
    select=f'({index} > 0.0)'
    tp=f'({select} && !variable.is_first_person && !variable.map_face_icon && !query.is_spectator)'
    fp=f'({select} && variable.is_first_person && !variable.map_face_icon && !query.is_spectator)'
    paws=f"({fp} && (query.has_property('pet:view') ? query.property('pet:view') == 'paws' : 1.0))"
    native=read(root/'upstream/player.entity.json');d=native['minecraft:client_entity']['description'];s=d['scripts']
    s.setdefault('initialize',[]).extend(['variable.pet_active = 0.0;','variable.pet_model_id = 0.0;','variable.pet_armor_fit = 0.0;','variable.melee_spear_equipped = 0.0;'])
    s['pre_animation'].extend([f'variable.pet_index = {index};',f'variable.pet_model_id = {getter};',f'variable.pet_active = {select};',f'variable.pet_tp = {tp};',f'variable.pet_fp_paws = {paws};',"variable.pet_armor_fit = variable.pet_active && (query.has_property('pet:armor_fit') ? query.property('pet:armor_fit') : 1.0);"])
    s['variables'].update({'variable.pet_active':'public','variable.pet_model_id':'public','variable.pet_armor_fit':'public'})
    s['animate']=[{'root':'1.0'}]
    raw=read(root/'catalog/rigs/quadruped_clips.json')['animations'];common={}
    for name in ['fp_swap','fp_lift','paw_flex']:
        clip=deepcopy(raw['animation.pet.'+name]);clip=mapped(clip,lambda v:v.replace(OLD_SELECT,select))
        if name=='fp_lift':clip=mapped(clip,lambda v:v.replace(": 0.0)",": 2.0)"))
        common['animation.pet.'+name]=clip
    write(rp/'animations/pet_shared.animation.json',{'format_version':'1.8.0','animations':common})
    d['animations']['first_person_swap_item']='animation.pet.fp_swap'
    for p in pets:
        ident=p['id']
        model=read(root/p['model']);model['minecraft:geometry'][0]['description']['identifier']=f'geometry.pet.{ident}'
        model['minecraft:geometry'][0]['bones']=pet_world_bones(model['minecraft:geometry'][0]['bones'])+handhelds.helpers(p)
        pawmodel=read(root/p['first_person']['model']);pawmodel['minecraft:geometry'][0]['description']['identifier']=f'geometry.pet.{ident}.paws'
        write(rp/f'models/entity/pets/{ident}/model.geo.json',model);write(rp/f'models/entity/pets/{ident}/paws.geo.json',pawmodel)
        for asset_key,fn in [(p['texture'],'coat.png'),(p['first_person']['texture'],'paws.png')]:
            dest=rp/f'textures/entity/pets/{ident}/{fn}';dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/asset_key,dest)
        d['geometry']['pet_'+ident]=f'geometry.pet.{ident}';d['geometry']['pet_'+ident+'_paws']=f'geometry.pet.{ident}.paws'
        d['textures']['pet_'+ident]=f'textures/entity/pets/{ident}/coat';d['textures']['pet_'+ident+'_paws']=f'textures/entity/pets/{ident}/paws'
        clips=generate_animations(root,p,rp)
        for full in clips:
            short=full.split(f'animation.pet.{ident}.')[1];d['animations'][f'pet_{ident}_{short}']=full
        d['animations'][f'pet_{ident}_locomotion']=f'controller.animation.pet.{ident}.locomotion'
        cond=f"variable.pet_tp && variable.pet_model_id == {p['wire_id']}"
        moving=f"{cond} && ((query.has_property('pet:motion') ? query.property('pet:motion') : 1.0) || query.is_riding)"
        for name,condition in [('grip',cond),('shield_pose',cond),('locomotion',moving),('secondary',moving+' && !query.is_sleeping'),('look',moving+' && !query.is_sleeping'),('attack',cond+' && variable.attack_time > 0.0'),('eat',cond+' && query.is_eating')]:
            s['animate'].append({f'pet_{ident}_{name}':condition})
        label={'carter':'D52','mochi':'M52','casper':'C52'}.get(ident,'D52')
        badge(rp/f'textures/entity/pets/markers/{ident}_052.png',label,(24,120,85) if ident=='carter' else (82,88,125),version_str)
        d['textures']['pet_marker_'+ident]=f'textures/entity/pets/markers/{ident}_052'
        # Face thumbnail initially taken from actual coat atlas; rendered portraits may override this source.
        icon=root/f'assets/pets/{ident}/icon.png'
        target=rp/f'textures/ui/pets/{ident}.png';target.parent.mkdir(parents=True,exist_ok=True)
        if icon.exists():shutil.copy2(icon,target)
        else:Image.open(root/p['texture']).resize((128,128)).save(target)
    d['animations']['pet_paw_flex']='animation.pet.paw_flex';d['animations']['pet_fp_lift']='animation.pet.fp_lift'
    d['animations']['pet_seat_align']='animation.pet.seat_align'
    write(rp/'animations/pet_seating.animation.json',{'format_version':'1.8.0','animations':{'animation.pet.seat_align':seating.alignment_clip()}})
    write(rp/'animations/pet_armor_fit.animation.json',{'format_version':'1.8.0','animations':{'animation.pet.armor_fit':armor_fit_clip()}})
    s['animate'].append({'pet_seat_align':'variable.pet_tp && query.is_riding'})
    s['animate'] += [{'pet_paw_flex':'variable.pet_fp_paws && variable.attack_time > 0.0'},{'pet_fp_lift':f'{fp} && ({EMPTY})'}]
    # Primary player rendering, retaining original Human visibility rules.
    oldrc=read(base/'resource_pack/render_controllers/player.render_controllers.json')['render_controllers'];rc={}
    for name,first in [('controller.render.player.third_person',False),('controller.render.player.first_person',True)]:
        entry=deepcopy(oldrc[name]);entry['rebuild_animation_matrices']=True
        entry['arrays']={'geometries':{'Array.pet_models':['Geometry.default']+[f'Geometry.pet_{p["id"]}'+('_paws' if first else '') for p in pets]},
                         'textures':{'Array.pet_coats':['Texture.default']+[f'Texture.pet_{p["id"]}'+('_paws' if first else '') for p in pets]}}
        idx='variable.pet_fp_paws ? variable.pet_index : 0.0' if first else 'variable.pet_index'
        entry['geometry']=f'Array.pet_models[{idx}]';entry['textures']=[f'Array.pet_coats[{idx}]']
        entry['part_visibility']=mapped(entry['part_visibility'],lambda v:v.replace(OLD_SELECT,select).replace('cav_debug_mouth','pet_debug_mouth'))
        rc[name]=entry
    # Keep a stable native-body pass. It never selects a pet geometry; the
    # per-pet body passes below are separate and contain only pet_* bones.
    native_tp=read(root/'upstream/native_armor_052/player.third_person.render_controller.json')
    for row in native_tp['part_visibility']:
        for name,value in row.items():
            v='1.0' if value is True else '0.0' if value is False else value
            row[name]=f'({v}) && !variable.pet_tp'
    rc['controller.render.player.third_person']=native_tp
    for p in pets:
        ident=p['id'];name=f'controller.render.pet.{ident}.body'
        rc[name]={'geometry':f'Geometry.pet_{ident}',
            'materials':[{'*':'Material.default'}],
            'textures':[f'Texture.pet_{ident}'],'rebuild_animation_matrices':True,
            'part_visibility':[{'*':True},{'pet_debug_mouth':DEBUG}]}
        # Native renderer remains in its original place and is not gated out.
        d['render_controllers'].append({name:f'variable.pet_tp && variable.pet_model_id == {p["wire_id"]}'})
    write(rp/'render_controllers/player.render_controllers.json',{'format_version':'1.8.0','render_controllers':rc})
    persona={}
    for file,gate in [('persona.third_person.extracted.json',tp),('persona.first_person.extracted.json',paws)]:
        for name,entry in read(root/'upstream'/file)['render_controllers'].items():
            for rule in entry['part_visibility']:
                for k,val in rule.items():rule[k]=f'({"1.0" if val is True else "0.0" if val is False else val}) && !{gate}'
            persona[name]=entry
    write(rp/'render_controllers/persona.render_controllers.json',{'format_version':'1.8.0','render_controllers':persona})
    cape=read(root/'upstream/cape.render_controllers.json');entry=cape['render_controllers']['controller.render.player.cape'];entry['part_visibility']=[{'*':f'!{select}'}]+[{k:f'({v}) && !{select}' for k,v in row.items()} for row in entry['part_visibility']]
    write(rp/'render_controllers/cape.render_controllers.json',cape)
    # Debug markers do not reuse native skeleton names except the explicit hand-grip marker.
    marker=read(base/'resource_pack/models/entity/diag_p2.geo.json');marker=mapped(marker,lambda v:v.replace('geometry.pet.diag_p2','geometry.pet.marker').replace('cav_probe_root','pet_probe_root'))
    marker['minecraft:geometry'][0]['description']['texture_width']=64;marker['minecraft:geometry'][0]['description']['texture_height']=64
    for bone in marker['minecraft:geometry'][0]['bones']:
        for c in bone.get('cubes',[]):
            for face in c['uv'].values():face['uv_size']=[64,64]
    write(rp/'models/entity/pet_marker.geo.json',marker);d['geometry']['pet_marker']='geometry.pet.marker'
    badge(rp/'textures/entity/pets/markers/human_052.png','P52',(151,105,28),version_str);d['textures']['pet_marker_human']='textures/entity/pets/markers/human_052'
    badge(rp/'textures/ui/pet_diag_052.png','V52',(27,113,143),version_str);badge(rp/'textures/entity/pets/markers/cube_052.png','R52',(25,113,86),version_str)
    gm=read(base/'resource_pack/models/entity/grip_marker.geo.json');write(rp/'models/entity/grip_marker.geo.json',gm)
    Image.new('RGBA',(8,8),(26,227,246,255)).save(rp/'textures/entity/pets/markers/grip_052.png')
    d['geometry']['pet_grip_marker']='geometry.pet.grip_marker';d['textures']['pet_grip_marker']='textures/entity/pets/markers/grip_052'
    d['render_controllers'] += [{'controller.render.pet.marker':f'!variable.is_first_person && !variable.map_face_icon && !query.is_spectator && !query.is_in_ui && {DEBUG}'}]
    write(rp/'render_controllers/pet_markers.render_controllers.json',{'format_version':'1.8.0','render_controllers':{
        'controller.render.pet.marker':{'geometry':'Geometry.pet_marker','materials':[{'*':'Material.default'}],
            'arrays':{'textures':{'Array.pet_markers':['Texture.pet_marker_human']+[f'Texture.pet_marker_{p["id"]}' for p in pets]}},'textures':['Array.pet_markers[variable.pet_index]']},
        'controller.render.pet.grip_marker':{'rebuild_animation_matrices':True,'geometry':'Geometry.pet_grip_marker','materials':[{'*':'Material.default'}],'textures':['Texture.pet_grip_marker'],'part_visibility':[{'*':True}]}}})
    write(rp/'entity/player.entity.json',native)
    # Standalone probe uses the same catalog/models, never an invisible-player follower.
    for typ in ['diag_cube','diag_model']:
        old=read(base/f'resource_pack/entity/{typ}.entity.json');q=old['minecraft:client_entity']['description']
        if typ=='diag_cube':
            for geo in (base/'resource_pack/models/entity').glob('*cube*'):
                cube=read(geo)
                for g in cube['minecraft:geometry']:
                    g['description']['texture_width']=64;g['description']['texture_height']=64
                    for b in g['bones']:
                        for c in b.get('cubes',[]):
                            for face in c['uv'].values():face['uv']=[0,0];face['uv_size']=[64,64]
                write(rp/'models/entity'/geo.name,cube)
            q['textures']={'default':'textures/entity/pets/markers/cube_052'}
            q['render_controllers']=['controller.render.pet.probe_cube']
        else:
            q['geometry']={f'pet_{p["id"]}':f'geometry.pet.{p["id"]}' for p in pets};q['textures']={f'pet_{p["id"]}':f'textures/entity/pets/{p["id"]}/coat' for p in pets}
            q['scripts']={'pre_animation':[f'variable.pet_probe_index = math.max(0.0, {index} - 1.0);']};q['render_controllers']=['controller.render.pet.probe_model']
        write(rp/f'entity/{typ}.entity.json',old)
    # Any old probe entity files still refer to old assets: retire their RP definitions. BP expiry/cleanup remains.
    for path in (rp/'entity').glob('legacy_*.json'):path.unlink()
    write(rp/'render_controllers/pet_probes.render_controllers.json',{'format_version':'1.8.0','render_controllers':{
        'controller.render.pet.probe_cube':{'geometry':'Geometry.default','materials':[{'*':'Material.default'}],'textures':['Texture.default']},
        'controller.render.pet.probe_model':{'arrays':{'geometries':{'Array.pet_probe_geo':[f'Geometry.pet_{p["id"]}' for p in pets]},'textures':{'Array.pet_probe_tex':[f'Texture.pet_{p["id"]}' for p in pets]}},'geometry':'Array.pet_probe_geo[variable.pet_probe_index]','materials':[{'*':'Material.default'}],'textures':['Array.pet_probe_tex[variable.pet_probe_index]'],'part_visibility':[{'*':True},{'pet_debug_mouth':False}]}}})
    morpher_assets(root,bp,rp,pets)
    armors=equipment(root,pets,rp)
    tools=handhelds.generate(root,pets,rp,d)
    side_items=carrying.generate(root,pets,rp,d)
    write(rp/'entity/player.entity.json',native)
    write(out/'EQUIPMENT_SUPPORT.json',{'armor':armors,'handhelds':tools,'side_carry':side_items,'shield':'native first-person retained; proven third-person geometry/poses in player replacement pass when native held items are hidden','special_items':'Rbow spear supported with a pet mouth visual; other spears, bows, crossbows, tridents and unmapped items retain native fallback.'})
    lang=rp/'texts/en_US.lang';text=lang.read_text() if lang.exists() else ''

    text+='\n'.join(f'pet.form.{p["id"]}={p["display_name"]}' for p in pets)+'\n';lang.parent.mkdir(parents=True,exist_ok=True);lang.write_text(text)
    # Explicit test-only inventory grants. No runtime gear mutations.
    (bp/'functions/pet/test_kit.mcfunction').write_text('give @s minecraft:diamond_pickaxe\ngive @s minecraft:diamond_sword\ngive @s minecraft:shield\ngive @s minecraft:oak_boat\ngive @s minecraft:water_bucket\ngive @s minecraft:nether_brick 16\ngive @s minecraft:iron_helmet\ngive @s minecraft:iron_chestplate\ngive @s minecraft:iron_leggings\ngive @s minecraft:iron_boots\ngive @s pet:paw_token\ngive @s pet:morpher_book\n')
    write(out/'BUILD_INFO.json',{'build':project['build'],'version':version,'catalog_sha256':catalog_hash,'pets':[{k:p[k] for k in ['id','wire_id','rig','first_person','validation']} for p in pets],
       'based_on':'Pets 0.4.5 + supplied Rbow 1.2.0; immutable native baseline 0.2.1','input_feedback':'Native armor still detached after form changes. Isolate native Player/armor passes and remove obsolete pet writes to humanoid bones. Sitting-direction issue is unchanged in this focused test build.',
       'minecraft_client_tested':False,'realm_tested':False,'armor_adapters':len(armors),'mapped_handheld_items':len(tools),'mapped_side_items':len(side_items),'suppression':'scripts.hide_held_items; both-hand replacement guard; native fallback for unmapped hands','native_first_person_item_rendering_changed':False,'new_pet_without_core_edits':True,'rbow_integration':True,'companion_version':project['integration']['companion_version']})
    rbp,rrp=rbow_compat.generate(root,out,bp,rp,project)
    write(out/'NATIVE_ARMOR_ISOLATION.json',validate_render_isolation(root,rp,pets))
    # Validate the actual serialized, merged outputs BEFORE archiving.
    write(out/'LOAD_VALIDATION.json', {folder.name:validate_behavior_pack(folder) for folder in [bp,rbp]})
    companion_str='.'.join(map(str,project['integration']['companion_version']))
    dist=out/'dist';dist.mkdir(exist_ok=True)
    pack_files=[(bp,f'ElleeDog_67_Pets_v{version_str}_BP.mcpack'),(rp,f'ElleeDog_67_Pets_v{version_str}_RP.mcpack'),
                (rbp,f'67_Rbow_Ore_Mod_v{companion_str}_Pets_BP.mcpack'),(rrp,f'67_Rbow_Ore_Mod_v{companion_str}_Pets_RP.mcpack')]
    for folder,filename in pack_files:zip_dir(folder,dist/filename)
    with zipfile.ZipFile(dist/f'ElleeDog_67_Pets_v{version_str}.mcaddon','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for _,filename in pack_files:
            path=dist/filename;info=zipfile.ZipInfo(path.name,(2026,9,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,path.read_bytes())
    write(out/'SHA256.json',{p.relative_to(out).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for folder in [bp,rp,rbp,rrp] for p in sorted(folder.rglob('*')) if p.is_file()})
    print(f'Built {project["build"]}: {len(pets)} pets, {len(armors)} fitted armor adapters. Not engine-tested.')
    return {'project':project,'pets':pets,'catalog_hash':catalog_hash,'out':out}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--output',type=Path)
    a=parser.parse_args();build(a.root,a.output)
