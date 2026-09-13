"""Author Casper as an all-white coat variant of the proven Mochi feline rig.
Only coat/paw pixels change. Eye pupils stay dark; eyes become blue; nose/pads pink.
No concept-image generation or changes to Carter/Mochi source assets.
"""
from pathlib import Path
from PIL import Image
import numpy as np
from catalog import read, write
from new_pet import add_pet
ROOT = Path(__file__).resolve().parents[1]

def recolor(source, destination):
    image=Image.open(source).convert('RGBA')
    result=[]
    for rgba in np.asarray(image).reshape(-1,4):
        r,g,b,a=map(int,rgba)
        if not a:
            result.append((r,g,b,a)); continue
        if max(r,g,b)<27:  # narrow pupil ink, not the much lighter black fur
            rgb=(r,g,b)
        elif g>r and r>b+25:  # Mochi's green irises
            rgb=(63,151,228)
        elif r>g+12 and r>b+12:  # nose, inner ear, and paw pads
            if r<125: rgb=(233+r-103,146+g-70,159+b-74)
            elif r<170: rgb=(224+r-136,155+g-107,168+b-105)
            else: rgb=(239+r-183,166+g-124,178+b-125)
        elif r>=252 and g>=250:  # tiny eye highlights
            rgb=(255,255,255)
        else:
            delta=(r-39) if r<100 else (r-239)
            rgb=(242+delta,243+delta,244+delta)
        result.append(tuple(max(0,min(255,int(v))) for v in rgb)+(a,))
    image.putdata(result); image.save(destination)

def main():
    if not (ROOT/'catalog/pets/casper.json').exists():
        add_pet(ROOT,'casper','Casper','mochi',variant=True)
    for f in ['coat.png','paws.png']:
        recolor(ROOT/f'assets/pets/mochi/{f}',ROOT/f'assets/pets/casper/{f}')
    details={
      'carter':("ElleeDog",'dog','Cavalier King Charles Spaniel','The softest and also laziest pet you ever met.'),
      'mochi':('warspoon17','cat','Tuxedo cat','A feisty street cat that will cuddle and purr and then bite.'),
      'casper':('Casper201312','cat','White cat','Casper is an indoor cat, super cuddly and is always trying to sneak outside.')
    }
    for ident,(owner,kind,species,story) in details.items():
        p=ROOT/f'catalog/pets/{ident}.json';d=read(p)
        d.update(owner=owner,pet_kind=kind,species=species,description=story)
        if ident=='casper':
            d['validation']={k:'new-Casper-variant-not-client-tested' for k in d['validation']}
            d['coat_features']={'fur':'all white','eyes':'blue','nose':'pink'}
        write(p,d)
    print('Authored Casper coat/paws and owner descriptions. Geometry/armor still share Mochi.')
if __name__=='__main__':main()
