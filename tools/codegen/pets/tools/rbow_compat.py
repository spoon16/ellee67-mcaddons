"""Matched Pets/Rbow integration, generated from the supplied Rbow 1.2.0 source.

The two behavior packs carry an IDENTICAL player definition. The resource packs
have no duplicate entity, geometry, attachable or render-controller identifiers.
Rbow runtime scripts stay in their original pack/UUID and execute exactly once.
This compiler never opens or changes a Minecraft world.
"""
from pathlib import Path
from copy import deepcopy
import hashlib
import shutil
from PIL import Image
from catalog import read, write

SLOTS=('helmet','chestplate','leggings','boots')
ARMOR_COUNT='elleedog:rbow_armor_count'

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def merge_player(pet_document, rbow_document):
    """Reviewed schema merge. Unknown divergent components fail the build."""
    a=deepcopy(pet_document); p=a['minecraft:entity']; r=rbow_document['minecraft:entity']
    # Rbow 1.2.0 and Pets 0.4.5 share the same native component baseline.
    for key,val in r['description'].items():
        if key=='properties': continue
        if key in p['description'] and p['description'][key]!=val:
            raise ValueError('Divergent player description: '+key)
        p['description'][key]=deepcopy(val)
    properties=p['description'].setdefault('properties',{})
    for key,val in r['description'].get('properties',{}).items():
        if key in properties and properties[key]!=val: raise ValueError('Property conflict: '+key)
        properties[key]=deepcopy(val)
    if len(properties)>32: raise ValueError('Shared player exceeds property budget')
    for key,val in r['components'].items():
        existing=p['components'].get(key)
        if key=='minecraft:environment_sensor':
            if set(val)!={'triggers'} or set(existing or {})!={'triggers'}:
                raise ValueError('Review changed environment_sensor schema')
            def arr(v): return v if isinstance(v,list) else [v]
            triggers=deepcopy(arr(existing['triggers']))
            for trigger in arr(val['triggers']):
                if trigger not in triggers: triggers.append(deepcopy(trigger))
            p['components'][key]={'triggers':triggers}
        elif existing is not None and existing!=val:
            raise ValueError('Unreviewed gameplay component conflict: '+key)
        else: p['components'][key]=deepcopy(val)
    for category in ('component_groups','events'):
        for key,val in r.get(category,{}).items():
            existing=p.setdefault(category,{}).get(key)
            if existing is not None and existing!=val: raise ValueError('Conflicting '+category+': '+key)
            p[category][key]=deepcopy(val)
    # Validate ALL event writes, including dormant legacy events. Inherited Pets
    # events previously wrote pet:form, removed when model_id replaced the enum.
    def check(node):
        if isinstance(node,dict):
            for key,val in node.get('set_property',{}).items():
                if key not in properties: raise ValueError('Event writes undeclared property '+key)
            for val in node.values():check(val)
        elif isinstance(node,list):
            for val in node:check(val)
    check(p)
    return a


def generate(root,out,bp,rp,project):
    cfg=project['integration'];src=root/cfg['rbow_source']
    manifest=read(src/'behavior_pack/manifest.json')
    if manifest['header']['version']!=cfg['source_version']:raise ValueError('Unexpected Rbow source version')
    # The source runtime is hash-locked, not fetched or regenerated during integration.
    lock=read(root/'integration/RBOW_INPUT_SHA256.json')
    for rel,h in lock.items():
        if sha(src/rel)!=h:raise ValueError('Pinned Rbow input changed: '+rel)
    rbp=out/'rbow_behavior_pack';rrp=out/'rbow_resource_pack'
    for src_dir,target in [(src/'behavior_pack',rbp),(src/'resource_pack',rrp)]:
        if target.exists():shutil.rmtree(target)
        shutil.copytree(src_dir,target)
    combined=merge_player(read(bp/'entities/player.json'),read(rbp/'entities/player.json'))
    write(bp/'entities/player.json',combined);write(rbp/'entities/player.json',combined)
    # Exactly one player-specific armor adapter: Pets' generated multi-form adapter.
    for slot in SLOTS:
        generated=read(rp/f'attachables/rbow_{slot}.player.json')['minecraft:attachable']['description']
        original=read(rrp/f'attachables/rbow_{slot}.player.json')['minecraft:attachable']['description']
        for field in ['identifier','textures','materials']:
            if generated[field]!=original[field]:raise ValueError('Rbow native armor fields changed: '+field)
        if generated['geometry']['default']!=original['geometry']['default']:
            raise ValueError('Native armor geometry changed')
        (rrp/f'attachables/rbow_{slot}.player.json').unlink()
    # Keep the known-working native spear in first person / Player / armor stands.
    # Only the world-space pet replica suppresses its native THIRD-person pass.
    path=rrp/'attachables/rbow_spear_native.json';spear=read(path)
    desc=spear['minecraft:attachable']['description']
    suppressed="(query.owner_identifier == 'minecraft:player' && !context.is_first_person && context.owning_entity->variable.pet_replace_hands)"
    desc['render_controllers']=[{name:f'!{suppressed}'} for name in desc['render_controllers']]
    write(rp/'attachables/rbow_spear_native.json',spear);path.unlink()
    # Rbow's normalized armor UVs use native 64x32 islands against 128x64
    # images. No destructive resampling or rewriting of the original textures.
    # Side-carried blocks have separate side/top atlas panels made from originals.
    for name in ['rbow_block','rbow_ore','deepslate_rbow_ore']:
        im=Image.open(src/f'resource_pack/textures/blocks/{name}.png').convert('RGBA')
        top=Image.open(src/f'resource_pack/textures/blocks/{name}_top.png').convert('RGBA') if name=='rbow_block' else im
        if im.size!=(32,32) or top.size!=(32,32):raise ValueError('Unexpected block texture size')
        atlas=Image.new('RGBA',(64,32));atlas.paste(im,(0,0));atlas.paste(top,(32,0))
        dest=rp/f'textures/entity/pets/rbow/{name}_carry_atlas.png';dest.parent.mkdir(parents=True,exist_ok=True);atlas.save(dest)
    pets_bp=read(bp/'manifest.json');pets_rp=read(rp/'manifest.json')
    rbow_bp=read(rbp/'manifest.json');rbow_rp=read(rrp/'manifest.json')
    cv=cfg['companion_version'];pv=project['version']
    for m,kind in [(rbow_bp,'Behavior'),(rbow_rp,'Resources')]:
        m['header']['version']=cv
        m['header']['name']=f"67 Rbow Ore Mod {'.'.join(map(str,cv))} — PETS COMPANION {kind}"
        m['header']['description']=f"Rbow 1.2.0 gameplay and art; matched Pets {'.'.join(map(str,pv))} player-definition fix. Use the four-pack compatibility bundle, not standalone."
        for mod in m['modules']:mod['version']=cv
        for dep in m.get('dependencies',[]):
            if 'uuid' in dep:dep['version']=cv
    # Acyclic dependencies. Activating Pets BP requests both behavior packs and
    # both resource packs. Order within those pairs cannot select a bad player.
    pets_bp['dependencies'].append({'uuid':rbow_bp['header']['uuid'],'version':cv})
    rbow_rp.setdefault('dependencies',[]).append({'uuid':pets_rp['header']['uuid'],'version':pv})
    for target,m in [(bp,pets_bp),(rp,pets_rp),(rbp,rbow_bp),(rrp,rbow_rp)]:write(target/'manifest.json',m)
    report={'pets_version':pv,'rbow_gameplay_base':cfg['source_version'],'rbow_companion_version':cv,
        'original_pack_uuids_preserved':True,'shared_player_properties':list(combined['minecraft:entity']['description']['properties']),
        'shared_player_sha256':sha(bp/'entities/player.json'),'rbow_input_files_verified':len(lock),
        'rbow_player_armor_owned_by':'Pets RP','rbow_spear_native_owner':'Pets RP; original native assets, animations and sound preserved',
        'third_person_tools':'32px original Rbow sprites in single mouth pass; native held pass hidden only if both hands supported',
        'native_gameplay_components_merged':['minecraft:environment_sensor','Rbow armor-count property, events and component groups'],
        'minecraft_client_tested':False,'realm_tested':False}
    write(out/'COMPATIBILITY_REPORT.json',report)
    icons={}
    for folder in [bp,rp,rbp,rrp]:
        m=read(folder/'manifest.json')
        icons[folder.name]={'name':m['header']['name'],'version':m['header']['version'],
                            'pack_icon_sha256':sha(folder/'pack_icon.png')}
    write(out/'ICON_VERIFICATION.json',{'pets_original_sha256':project['branding']['source_sha256'],
        'morpher_original_sha256':project['morpher_art']['source_sha256'],
        'packs':icons,'scope':'Existing Pets and Rbow pack icons preserved; no new icon art.',
        'minecraft_tested':False})

    return rbp,rrp
