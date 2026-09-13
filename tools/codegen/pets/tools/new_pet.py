"""Create a pet or coat variant on an existing rig without editing core scripts.
Example: python tools/new_pet.py --id buddy --name Buddy --from carter
The initial assets are copied placeholders. Edit them before a public release.
"""
from pathlib import Path
from copy import deepcopy
import argparse,shutil
from catalog import load_catalog,read,write,ID,CatalogError
ROOT=Path(__file__).resolve().parents[1]
def add_pet(root,ident,name,source_id,variant=False):
    root=Path(root).resolve();project,pets,wire=load_catalog(root)
    if not ID.fullmatch(ident) or ident=='human':raise CatalogError('Use a lowercase identifier starting with a letter, up to 32 characters')
    if not isinstance(name,str) or not name.strip():raise CatalogError('Display name is required')
    if ident in wire['reserved'] or ident in wire['retired']:raise CatalogError('Identifier is already reserved or retired; never recycle it')
    source=next((p for p in pets if p['id']==source_id),None)
    if source is None:raise CatalogError('Unknown source pet')
    number=max([0,*wire['reserved'].values(),*wire['retired'].values()])+1
    if number>project['max_wire_id']:raise CatalogError('Wire ID range exhausted')
    target=root/f'assets/pets/{ident}'
    if target.exists():raise CatalogError('Asset directory already exists')
    target.mkdir(parents=True)
    record={k:deepcopy(v) for k,v in source.items() if k not in ['wire_id','rig_definition']}
    paths=[('model.geo.json',source['model']),('coat.png',source['texture']),('paws.geo.json',source['first_person']['model']),('paws.png',source['first_person']['texture']),('armor_fit.json',source['equipment']['armor_fit'])]
    try:
        for filename,old in paths:
            if not variant or filename in ['coat.png','paws.png']:shutil.copy2(root/old,target/filename)
        record.update({'id':ident,'display_name':name,'order':max(p.get('order',0) for p in pets)+10})
        record['model']=f'assets/pets/{ident}/model.geo.json';record['texture']=f'assets/pets/{ident}/coat.png'
        record['first_person']['model']=f'assets/pets/{ident}/paws.geo.json';record['first_person']['texture']=f'assets/pets/{ident}/paws.png'
        record['equipment']['armor_fit']=f'assets/pets/{ident}/armor_fit.json'
        record['validation']={key:'unreviewed-cloned-placeholder' for key in record['validation']}
        if variant:
            record['model']=source['model'];record['first_person']['model']=source['first_person']['model'];record['equipment']['armor_fit']=source['equipment']['armor_fit'];record['variant_of']=source_id
        wire['reserved'][ident]=number
        write(root/f'catalog/pets/{ident}.json',record);write(root/'catalog/wire_ids.json',wire)
        load_catalog(root)
    except Exception:
        shutil.rmtree(target,ignore_errors=True);(root/f'catalog/pets/{ident}.json').unlink(missing_ok=True)
        wire['reserved'].pop(ident,None);write(root/'catalog/wire_ids.json',wire);raise
    return number
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--id',required=True);p.add_argument('--name',required=True);p.add_argument('--from',dest='source',required=True)
    p.add_argument('--variant',action='store_true',help='Share source rig, geometry and armor fit; copy only coat/paw textures')
    a=p.parse_args();n=add_pet(a.root,a.id,a.name,a.source,a.variant);print(f'Created {a.id}, permanent model ID {n}. Edit assets, then python tools/build.py and run tests.')
