#!/usr/bin/env python3
"""Wire Rbow to the game's own spear resources; author no held transforms.

The native definitions are deliberately external references. We do not copy them
under either vanilla or renamed identifiers. The old experiments are retained
under diagnostics/history for audit only and are never built by the release.
"""
from __future__ import annotations
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RP = ROOT / 'resource_pack'
OLD = (
    'attachables/rbow_spear_lab5.json',
    'models/entity/rbow_spear_lab5.geo.json',
    'animations/rbow_spear_lab5.animation.json',
    'render_controllers/rbow_spear_lab5.render_controllers.json',
)
ALIASES = {
    'held_first_person': 'animation.spear.held_first_person',
    'held_third_person': 'animation.spear.held_third_person',
    'held_controller': 'controller.animation.spear.held',
    'hit': 'animation.spear.hit',
    'hit_controller': 'controller.animation.spear.hit',
}

def definition() -> dict:
    return {
        'format_version': '1.10.0',
        'minecraft:attachable': {'description': {
            'identifier': 'elleedog:rbow_spear',
            'materials': {
                'default': 'entity_alphatest',
                'enchanted': 'entity_alphatest_glint',
            },
            'textures': {
                'default': 'textures/entity/rbow_spear_lab5',
                'enchanted': 'textures/misc/enchanted_item_glint',
            },
            'geometry': {'default': 'geometry.spear'},
            'scripts': {'animate': ['held_controller', 'hit_controller']},
            'animations': ALIASES,
            'sound_effects': {'hit': 'item.spear.hit'},
            'render_controllers': ['controller.render.item_default'],
        }},
    }

def main() -> None:
    for relative in OLD:
        (RP / relative).unlink(missing_ok=True)
    held = ROOT / 'art/spear/rbow_held_lab5.png'
    lock = json.loads((ROOT/'docs/v1.1.10_spear_texture_lock.json').read_text())
    if hashlib.sha256(held.read_bytes()).hexdigest() != lock['sha256']:
        raise ValueError('The previously tested held texture has changed.')
    target = RP/'textures/entity/rbow_spear_lab5.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(held,target)
    path = RP/'attachables/rbow_spear_native.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(definition(),indent=2)+'\n',encoding='utf8')
    print('Wired one Rbow attachable to native spear resources. No authored offsets, mesh or player animation overrides.')

if __name__ == '__main__':
    main()
