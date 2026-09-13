"""Compare pet-visible channels against 0.5.1, excluding only obsolete humanoid companions.
Reference hashes were taken from the delivered 0.5.1 source archive.
"""
from pathlib import Path
from copy import deepcopy
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
REFERENCE=json.loads((ROOT/'tests/native_armor_052_reference.json').read_text())
def projected(value):
    d=deepcopy(value)
    if 'minecraft:geometry' in d:
        for g in d['minecraft:geometry']:
            if not g['description']['identifier'].endswith('.paws'):
                g['bones']=[b for b in g['bones'] if b['name'].startswith('pet_')]
    if 'animations' in d:
        d['animations'].pop('animation.pet.native_reset',None)
        for name,a in d['animations'].items():
            if name not in ['animation.pet.fp_swap','animation.pet.fp_lift','animation.pet.paw_flex']:
                a['bones']={b:c for b,c in a.get('bones',{}).items() if b.startswith('pet_')}
    return d

def digest(d):return hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def assert_unchanged_content(test):
    for rel,h in REFERENCE['raw'].items():
        test.assertEqual(hashlib.sha256((ROOT/rel).read_bytes()).hexdigest(),h,rel)
    for rel,h in REFERENCE['projected'].items():
        test.assertEqual(digest(projected(json.loads((ROOT/rel).read_text()))),h,rel)
    for rel,fields in REFERENCE['armor_fields'].items():
        current=json.loads((ROOT/rel).read_text())['minecraft:attachable']['description']
        test.assertEqual({k:current[k] for k in fields},fields,rel)
