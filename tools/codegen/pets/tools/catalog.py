"""Validated, build-time pet catalog. Runtime selection never depends on list order."""
from __future__ import annotations
import json, re, math
from pathlib import Path
from seat_kinds import normalize_seating

ID = re.compile(r'^[a-z][a-z0-9_]{0,31}$')
class CatalogError(ValueError): pass

def read(path):
    def unique(pairs):
        out={}
        for k,v in pairs:
            if k in out: raise CatalogError(f'Duplicate JSON key: {k} in {path}')
            out[k]=v
        return out
    return json.loads(Path(path).read_text(),object_pairs_hook=unique)

def write(path, data):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

def asset(root, value):
    if not isinstance(value,str): raise CatalogError('Asset path must be a string')
    p=(root/value).resolve()
    if not p.is_relative_to(root.resolve()) or Path(value).is_absolute(): raise CatalogError(f'Unsafe asset path {value}')
    if not p.is_file(): raise CatalogError(f'Missing asset: {value}')
    return p

def vector(v,label):
    if not isinstance(v,list) or len(v)!=3 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in v):
        raise CatalogError(f'{label} must be three finite numbers')

def load_catalog(root):
    root=Path(root).resolve(); project=read(root/'project.json'); ids=read(root/'catalog/wire_ids.json')
    if ids.get('schema_version')!=1 or ids.get('human')!=0: raise CatalogError('Wire registry schema or human ID invalid')
    assigned={**ids['retired'],**ids['reserved']}
    if set(ids['retired']) & set(ids['reserved']): raise CatalogError('Retired ID cannot be live')
    nums=list(assigned.values())
    if len(set(nums))!=len(nums): raise CatalogError('Wire IDs must be unique, including retired IDs')
    for k,v in assigned.items():
        if not ID.fullmatch(k) or k=='human' or type(v)!=int or not 1<=v<=project['max_wire_id']: raise CatalogError('Invalid permanent wire assignment')
    records=[]; seen=set()
    native=read(root/'catalog/rigs/native_v1.json')['bones']
    native_map={b['name']:b for b in native}
    for path in sorted((root/'catalog/pets').glob('*.json')):
        d=read(path); ident=d.get('id','')
        if d.get('schema_version')!=1 or not ID.fullmatch(ident) or ident=='human' or ident in seen: raise CatalogError(f'Invalid/duplicate pet ID: {ident}')
        seen.add(ident)
        if path.stem!=ident or ident not in ids['reserved']: raise CatalogError(f'{ident}: filename and reserved wire ID required')
        if not isinstance(d.get('display_name'),str) or not d['display_name'].strip(): raise CatalogError(f'{ident}: display_name required')
        for field in ['owner','pet_kind','description','species']:
            if not isinstance(d.get(field),str) or not d[field].strip(): raise CatalogError(f'{ident}: {field} is required')
        if not ID.fullmatch(d.get('rig','')): raise CatalogError(f'{ident}: bad rig name')
        rig=read(asset(root,f"catalog/rigs/{d['rig']}.json"))
        if rig.get('family')!='quadruped_v1': raise CatalogError('Unsupported rig family; add a tested compiler for a new family')
        for key in ['gait','stride_clock','ear_swing','tail_swing']:
            s=rig['scales'][key]
            if type(s) not in [int,float] or not .01<=s<=3: raise CatalogError('Rig scale out of range')
        g=read(asset(root,d['model']))['minecraft:geometry']
        if len(g)!=1: raise CatalogError('Each pet source contains exactly one geometry')
        bones=g[0]['bones']; by={b['name']:b for b in bones}
        if len(by)!=len(bones) or len({n.lower() for n in by})!=len(by): raise CatalogError('Bone names must be unique case-insensitively')
        for n in rig['required_bones']:
            if n not in by: raise CatalogError(f'{ident}: required bone missing: {n}')
        for n,b in by.items():
            vector(b['pivot'],f'{ident}/{n}.pivot')
            if b.get('parent') and b['parent'] not in by: raise CatalogError('Missing bone parent')
            visited={n}; parent=b.get('parent')
            while parent:
                if parent in visited: raise CatalogError('Bone parent cycle')
                visited.add(parent);parent=by[parent].get('parent')
        for n,b in native_map.items():
            actual=by.get(n,{})
            if actual.get('pivot')!=b['pivot'] or actual.get('parent')!=b.get('parent'): raise CatalogError(f'{ident}: native hand rig changed: {n}')
            if actual.get('cubes'): raise CatalogError('Visible native body cubes in pet model')
        asset(root,d['texture']); fp=d['first_person']; asset(root,fp['texture']); fg=read(asset(root,fp['model']))['minecraft:geometry'][0]
        fby={b['name']:b for b in fg['bones']}
        for n,b in native_map.items():
            if fby.get(n,{}).get('pivot')!=b['pivot'] or fby.get(n,{}).get('parent')!=b.get('parent'): raise CatalogError(f'{ident}: incompatible first-person bind frame {n}')
        if type(fp['default_hand_height'])!=int or not -8<=fp['default_hand_height']<=12: raise CatalogError('Invalid default hand height')
        for slot in ['mainhand','offhand']:
            vector(d['equipment'][slot]['position'],f'{ident}/{slot}')
            vector(d['equipment'][slot].get('rotation',[0,0,0]),f'{ident}/{slot} rotation')
        mouth=d['equipment']['mouth_sprite'];shield=d['equipment']['shield']
        vector(mouth['position'],'mouth position');vector(mouth['rotation'],'mouth rotation')
        for key in ['pixel_scale','thickness']:
            val=mouth[key]
            if type(val) not in [int,float] or not math.isfinite(val) or not .1<=val<=2: raise CatalogError('Invalid mouth mesh scale/thickness')
        carry=d['equipment'].get('side_carry',{})
        for key in ['sprite_position','cube_position']:vector(carry.get(key),ident+' carry '+key)
        if carry['sprite_position'][0]>=0 or carry['cube_position'][0]>=0:raise CatalogError('Main-hand carry must be opposite the positive-X offhand shield')
        for key in ['pixel_scale','cube_size','sprite_thickness']:
            value=carry.get(key)
            if type(value) not in [int,float] or not math.isfinite(value) or not 0<value<=8:raise CatalogError('Invalid side carry scale')
        bake=mouth.get('bake_pixel_rotation_z')
        if type(bake) not in [int,float] or not math.isfinite(bake):raise CatalogError('Finite baked tool rotation required')
        for key in ['side_position','front_position','side_rotation','front_rotation']:vector(shield[key],'shield '+key)
        for key in ['width','height','depth']:
            if type(shield[key]) not in [int,float] or not math.isfinite(shield[key]) or not 0<shield[key]<=32:raise CatalogError('Invalid shield dimensions')
        if d['equipment']['helmet_profile'] not in ['covered_crown_floppy_ears','upright_ear_openings']:raise CatalogError('Unknown helmet fitting profile')
        fit=read(asset(root,d['equipment']['armor_fit']))
        if set(fit['slots'])!={'helmet','chestplate','leggings','boots'}: raise CatalogError('All four armor-fit slots required')
        for parts in fit['slots'].values():
            for p in parts:
                if p['bone'] not in by: raise CatalogError('Armor references missing bone')
                vector(p['origin'],'armor origin');vector(p['size'],'armor size')
                if any(x<=0 for x in p['size']): raise CatalogError('Armor cube must have positive dimensions')
        d['seating']=normalize_seating(d.get('seating'),ident,CatalogError)
        d['wire_id']=ids['reserved'][ident];d['rig_definition']=rig
        records.append(d)
    if not records: raise CatalogError('No pets registered')
    return project,sorted(records,key=lambda p:(p.get('order',0),p['id'])),ids
