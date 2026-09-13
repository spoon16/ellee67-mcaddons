"""Build-time checks for the loader failures observed in Minecraft's content log.

These are conservative authoring checks, NOT a Minecraft loader implementation.
Most importantly: json.loads preserves JSON 0 vs 0.0 as int vs float in Python.
Numeric equality (0 == 0.0) is not sufficient for a typed entity default.
"""
from __future__ import annotations
from pathlib import Path
import math
from catalog import read

class LoadValidationError(ValueError):
    pass


def _fail(label, message):
    raise LoadValidationError(f'{label}: {message}')


def validate_property_definitions(definitions, label='entity properties'):
    if not isinstance(definitions, dict):
        _fail(label, 'expected property object')
    if len(definitions) > 32:
        _fail(label, 'more than 32 properties')
    for key, spec in definitions.items():
        at=f'{label}/{key}'
        kind=spec.get('type')
        if kind not in ('bool', 'int', 'float', 'enum'):
            _fail(at, 'unsupported property type')
        if 'default' not in spec:
            _fail(at, 'missing default')
        value=spec['default']
        # Molang expression defaults are allowed by Bedrock; this pack uses
        # literal defaults. Expression evaluation needs engine validation.
        expression=isinstance(value, str) and kind != 'enum'
        if expression:
            if not value.strip():
                _fail(at, 'empty expression default')
        elif kind == 'enum':
            values=spec.get('values', [])
            if not isinstance(value,str) or value not in values:
                _fail(at, 'enum default must be a declared string value')
            if not 1 <= len(values) <= 16 or len(values)!=len(set(values)):
                _fail(at, 'invalid enum values')
        elif kind == 'bool':
            if type(value) is not bool:
                _fail(at, 'bool default must be a JSON boolean')
        elif kind == 'int':
            if type(value) is not int:
                _fail(at, 'int default must be a JSON integer')
        elif kind == 'float':
            if type(value) is not float or not math.isfinite(value):
                _fail(at, 'float default must be a JSON decimal (for example 0.0, not 0)')
        if kind in ('int', 'float'):
            bounds=spec.get('range')
            if not isinstance(bounds,list) or len(bounds)!=2:
                _fail(at, 'expected two range bounds')
            required=int if kind=='int' else float
            if any(type(n) is not required or not math.isfinite(n) for n in bounds):
                _fail(at, f'{kind} range bounds must be authored with matching numeric types')
            if bounds[0] > bounds[1]:
                _fail(at, 'reversed range')
            if not expression and not bounds[0] <= value <= bounds[1]:
                _fail(at, 'default outside range')
        if 'client_sync' in spec and type(spec['client_sync']) is not bool:
            _fail(at, 'client_sync must be a JSON boolean')
    return len(definitions)


def validate_event_literals(node, definitions, label='events'):
    """Validate literal event writes, without trying to execute Molang expressions."""
    if isinstance(node,dict):
        for key,value in node.get('set_property',{}).items():
            if key not in definitions:
                _fail(label, 'write to undeclared property '+key)
            spec=definitions[key]
            if isinstance(value,str) and spec['type'] != 'enum':
                continue
            copy=dict(spec,default=value)
            validate_property_definitions({key:copy},label)
        for key,value in node.items():
            validate_event_literals(value,definitions,label+'/'+key)
    elif isinstance(node,list):
        for index,value in enumerate(node):
            validate_event_literals(value,definitions,f'{label}[{index}]')


def validate_recipe(document, label='recipe'):
    ver=tuple(int(v) for v in document.get('format_version','0').split('.'))
    for kind in ('minecraft:recipe_shaped','minecraft:recipe_shapeless'):
        if kind not in document or ver < (1,20):
            continue
        recipe=document[kind]
        unlock=recipe.get('unlock')
        if not isinstance(unlock,list) or not unlock:
            _fail(label, '1.20+ crafting recipe is missing unlock data')
        for entry in unlock:
            if not isinstance(entry,dict) or not (entry.get('item') or entry.get('context')):
                _fail(label, 'unlock entry must declare an item or context')


def validate_behavior_pack(folder):
    folder=Path(folder)
    counts={'entity_files':0,'properties':0,'recipes':0}
    for path in sorted((folder/'entities').rglob('*.json')):
        entity=read(path).get('minecraft:entity',{})
        definitions=entity.get('description',{}).get('properties',{})
        counts['properties']+=validate_property_definitions(definitions,str(path))
        validate_event_literals(entity.get('events',{}),definitions,str(path))
        counts['entity_files']+=1
    for path in sorted((folder/'recipes').rglob('*.json')):
        validate_recipe(read(path),str(path))
        counts['recipes']+=1
    return counts
