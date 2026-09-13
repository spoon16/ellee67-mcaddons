"""Package the approved book-option-3 artwork and book item definition."""
from pathlib import Path
from PIL import Image, ImageDraw
from catalog import read, write
TITLE='ElleeDog 67 Pet Morpher'
VERSION='0.5.2'

def book_icon(root=None):
    import hashlib
    root=Path(root) if root is not None else Path(__file__).resolve().parents[1]
    art=read(root/'project.json')['morpher_art']
    source=root/art['source']
    if hashlib.sha256(source.read_bytes()).hexdigest()!=art['source_sha256']:
        raise ValueError('Selected Morpher option 3 artwork was changed.')
    # Full approved composition, preserving transparent edges. No procedural paw.
    return Image.open(source).convert('RGBA').resize(tuple(art['texture_size']),Image.Resampling.LANCZOS)

def generate(root,bp,rp,pets):
    icon=book_icon(root);source=root/'assets/shared/morpher_book.png';icon.save(source)
    path=rp/'textures/items/pet_morpher_book_043.png';path.parent.mkdir(parents=True,exist_ok=True);icon.save(path)
    atlas=read(rp/'textures/item_texture.json')
    atlas['texture_data']['pet_morpher_book']={'textures':'textures/items/pet_morpher_book_043'}
    write(rp/'textures/item_texture.json',atlas)
    write(bp/'items/morpher_book.json',{
        'format_version':'1.26.0','minecraft:item':{
            'description':{'identifier':'pet:morpher_book','menu_category':{'category':'items'}},
            'components':{
                'minecraft:display_name':{'value':'item.pet:morpher_book.name'},
                'minecraft:icon':'pet_morpher_book','minecraft:max_stack_size':1,
                'minecraft:interact_button':'Open Pet Morpher',
                'minecraft:cooldown':{'category':'pet_morpher','duration':0.35},
                'pet:open_morpher':{}
            }
        }
    })
    # Simple silhouette icon for the Player option, not a replacement player skin.
    im=Image.new('RGBA',(32,32),(0,0,0,0));d=ImageDraw.Draw(im)
    d.rectangle((11,2,20,11),fill=(221,186,146,255));d.rectangle((11,2,20,5),fill=(86,62,44,255))
    d.rectangle((9,13,22,23),fill=(37,145,159,255));d.rectangle((5,13,8,24),fill=(221,186,146,255));d.rectangle((23,13,26,24),fill=(221,186,146,255))
    d.rectangle((10,24,14,30),fill=(69,74,133,255));d.rectangle((17,24,21,30),fill=(69,74,133,255))
    path=rp/'textures/ui/pets/player.png';path.parent.mkdir(parents=True,exist_ok=True);im.save(path)
    for lang in sorted((rp/'texts').glob('*.lang')):
        text=lang.read_text().rstrip()+'\n'
        entries={'item.pet:morpher_book.name':TITLE,'pet.form.human':'Player','pet.form.player':'Player',
                 'pet.diag.rp_052':f'PET-RP-052: ElleeDog 67 Pets {VERSION} NATIVE ARMOR resources loaded.'}
        for pet in pets:
            entries[f'pet.form.{pet["id"]}']=pet['display_name']
        keys=set(entries)
        text='\n'.join(line for line in text.splitlines() if line.split('=',1)[0] not in keys)+'\n'
        lang.write_text(text+'\n'.join(k+'='+v for k,v in entries.items())+'\n')
