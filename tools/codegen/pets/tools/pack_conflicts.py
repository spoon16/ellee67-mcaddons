"""Read-only audit of overlapping Bedrock definitions; never extracts or merges a pack.

Usage: python tools/pack_conflicts.py pets.mcaddon other.mcaddon --output report.json
The result detects shared identifiers, not every possible gameplay/renderer incompatibility.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import io,json
from pathlib import Path
import zipfile
from catalog import write

MAX_BYTES=64*1024*1024
MAX_FILES=20000
MAX_DEPTH=3

def definitions(source):
    source=Path(source)
    entries=defaultdict(list)
    warnings=[]
    budget={'bytes':0,'files':0}
    def count(size):
        budget['bytes']+=size;budget['files']+=1
        if budget['bytes']>MAX_BYTES or budget['files']>MAX_FILES:
            raise ValueError('Pack exceeds the bounded audit budget (64 MiB / 20,000 entries).')
    def parse(name,data):
        try:d=json.loads(data.decode('utf-8-sig'))
        except (ValueError,UnicodeError):
            warnings.append(f'{name}: not strict UTF-8 JSON; inspect manually.')
            return
        if not isinstance(d,dict):return
        for key,kind in [('minecraft:entity','behavior_entity'),('minecraft:client_entity','client_entity'),('minecraft:attachable','attachable'),('minecraft:item','item'),('minecraft:block','block')]:
            ident=d.get(key,{}).get('description',{}).get('identifier')
            if isinstance(ident,str):entries[f'{kind}:{ident}'].append(name)
        for key in ['render_controllers','animation_controllers','animations']:
            if isinstance(d.get(key),dict):
                for ident in d[key]:entries[f'{key}:{ident}'].append(name)
        if isinstance(d.get('minecraft:geometry'),list):
            for geo in d['minecraft:geometry']:
                ident=geo.get('description',{}).get('identifier')
                if ident:entries[f'geometry:{ident}'].append(name)
    def archive(data,prefix,depth=0):
        if depth>MAX_DEPTH:raise ValueError('Nested pack depth exceeds audit limit.')
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for item in z.infolist():
                if item.is_dir():continue
                suffix=Path(item.filename).suffix.lower()
                if suffix not in ['.json','.mcpack','.mcaddon']:continue
                count(item.file_size)
                payload=z.read(item)
                name=prefix+'!/'+item.filename
                if suffix=='.json':parse(name,payload)
                else:archive(payload,name,depth+1)
    if source.is_dir():
        for p in sorted(source.rglob('*.json')):
            if p.is_symlink():warnings.append(f'{p}: symlink ignored.');continue
            count(p.stat().st_size);parse(str(p.relative_to(source)),p.read_bytes())
    elif source.is_file():
        if source.stat().st_size>MAX_BYTES:raise ValueError('Archive too large for bounded audit.')
        archive(source.read_bytes(),source.name)
    else:raise FileNotFoundError(source)
    return entries,warnings

def compare(left,right):
    a,aw=definitions(left);b,bw=definitions(right)
    collisions=[{'key':key,'left':a[key],'right':b[key]} for key in sorted(a.keys()&b.keys())]
    return {'left':Path(left).name,'right':Path(right).name,'overlapping_definitions':collisions,
            'left_duplicate_definitions':{k:v for k,v in a.items() if len(v)>1},
            'right_duplicate_definitions':{k:v for k,v in b.items() if len(v)>1},
            'warnings':aw+bw,'merge_performed':False,
            'interpretation':'Overlaps need review. Zero overlaps does not prove compatibility; this audit does not model pack priority, textures, scripts, gameplay, or skin overrides.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('left',type=Path);parser.add_argument('right',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();report=compare(args.left,args.right)
    if args.output:write(args.output,report)
    else:print(json.dumps(report,indent=2))
