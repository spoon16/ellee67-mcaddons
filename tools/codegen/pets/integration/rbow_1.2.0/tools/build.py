#!/usr/bin/env python3
"""Run local tests and produce deterministic Bedrock archives.

No network calls, package installation, world edits or Minecraft invocation.
Prerequisites: Python 3.10+, Pillow, Node 20+. Optional PNG regeneration is a
separate step requiring NumPy; generated textures are already included.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
LABEL=json.loads((ROOT/'release.json').read_text())['archive_label']
STAMP=(2026,9,12,0,0,0)

def run(command: list[str]) -> str:
    p=subprocess.run(command,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
    print(p.stdout,end='')
    if p.returncode:raise RuntimeError(f'Validation failed: {command!r}')
    return '$ '+' '.join(command)+'\n'+p.stdout+'\n'

def archive(entries: list[tuple[str,bytes]]) -> bytes:
    memory=io.BytesIO()
    with zipfile.ZipFile(memory,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in sorted(entries):
            if name.startswith('/') or '..' in Path(name).parts:raise ValueError(f'Unsafe archive path: {name}')
            info=zipfile.ZipInfo(name,STAMP);info.compress_type=zipfile.ZIP_DEFLATED
            info.create_system=3;info.external_attr=0o100644<<16
            z.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    result=memory.getvalue()
    with zipfile.ZipFile(io.BytesIO(result)) as z:
        if z.testzip() is not None:raise RuntimeError('ZIP CRC validation failed')
    return result

def files_under(folder: Path) -> list[tuple[str,bytes]]:
    return [(p.relative_to(folder).as_posix(),p.read_bytes()) for p in sorted(folder.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc']

def runtime_pack(folder: Path) -> bytes:
    entries=files_under(folder)
    if 'manifest.json' not in dict(entries):raise RuntimeError('Missing root manifest')
    b=archive(entries)
    if b!=archive(entries):raise RuntimeError('Archive determinism check failed')
    return b

def main() -> int:
    if shutil.which('node') is None:raise RuntimeError('Node.js 20+ is required to run the tests.')
    for pack in ['behavior_pack','resource_pack']:
        for file in ['LICENSE','THIRD_PARTY_NOTICES.md']:
            shutil.copyfile(ROOT/file,ROOT/pack/file)
    logs=['67 Rbow Ore Mod — local build verification\n',
          'Scope: source/data/PNG/NBT checks and Node API mocks only. NOT an engine, Realm, or full schema validation.\n\n']
    logs.append(run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py','-v']))
    logs.append(run(['node','--experimental-vm-modules','--test',*map(str,sorted((ROOT/'tests').glob('*.test.mjs')))]))
    for f in sorted((ROOT/'behavior_pack/scripts').glob('*.js')):
        logs.append(run(['node','--check',str(f.relative_to(ROOT))]))
    DIST.mkdir(exist_ok=True)
    bp=runtime_pack(ROOT/'behavior_pack');rp=runtime_pack(ROOT/'resource_pack')
    entries=[('67_Rbow_Ore_Mod_Behavior.mcpack',bp),('67_Rbow_Ore_Mod_Resources.mcpack',rp)]
    mcaddon=archive(entries)
    if mcaddon!=archive(entries):raise RuntimeError('Nested archive determinism check failed')
    with zipfile.ZipFile(io.BytesIO(mcaddon)) as z:
        for name,payload in entries:
            if z.read(name)!=payload:raise RuntimeError('Nested pack mismatch')
    hashes={name:hashlib.sha256(data).hexdigest() for name,data in entries}
    hashes[LABEL+'.mcaddon']=hashlib.sha256(mcaddon).hexdigest()
    logs.append('PASS: JavaScript syntax, both root manifests, every ZIP CRC, nested pack bytes, and deterministic archive recreation.\n')
    logs.append('SHA-256:\n'+json.dumps(hashes,indent=2)+'\n')
    (ROOT/'TEST_RESULTS.txt').write_text(''.join(logs),encoding='utf8')
    (DIST/(LABEL+'.mcaddon')).write_bytes(mcaddon)
    for name,data in entries:(DIST/name).write_bytes(data)
    source=[]
    for p in sorted(ROOT.rglob('*')):
        rel=p.relative_to(ROOT)
        if p.is_file() and not any(s in {'dist','__pycache__','.git','node_modules'} for s in rel.parts) and p.suffix!='.pyc':
            source.append(('67_Rbow_Ore_Mod/'+rel.as_posix(),p.read_bytes()))
    (DIST/(LABEL+'_Source.zip')).write_bytes(archive(source))
    (DIST/'SHA256SUMS.txt').write_text('\n'.join(f'{h}  {name}' for name,h in hashes.items())+'\n')
    print('\nBuilt:',DIST/(LABEL+'.mcaddon'))
    print('Source:',DIST/(LABEL+'_Source.zip'))
    print('No Minecraft instance was run. Follow README.md for in-game acceptance tests.')
    return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except (OSError,RuntimeError,subprocess.TimeoutExpired) as exc:
        print(f'Build failed: {exc}',file=sys.stderr);raise SystemExit(1)
