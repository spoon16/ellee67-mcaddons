"""Build pack icons from the user's original, hash-pinned artwork. No generated art."""
from pathlib import Path
from io import BytesIO
import hashlib, json
from PIL import Image

def prepare_icon(root):
    root=Path(root)
    cfg=json.loads((root/'project.json').read_text())['branding']
    data=(root/cfg['source']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=cfg['source_sha256']:
        raise ValueError('Pack icon source differs from the user-approved upload.')
    with Image.open(BytesIO(data)) as image:
        if image.width != image.height:
            raise ValueError('Pack icon must be square; do not silently crop the artwork.')
        icon=image.convert('RGBA').resize(tuple(cfg['size']), Image.Resampling.LANCZOS)
    target=root/cfg['output']
    target.parent.mkdir(parents=True,exist_ok=True)
    icon.save(target, format='PNG', optimize=True)
    return target
