"""Mount kinds the seating scripts classify a ride into, and the per-pet seating profile baked for them.

The list index is the wire value of the client-synced `pet:seat_kind` property (0, "none", is not
mounted), so entries are only ever appended: saved seat trims and the client animation are keyed
by name and index respectively. The runtime reads the same list from catalog.generated.js.
"""
import math
SEAT_KINDS=['none','boat','pig','stairs','other','horse','strider','happy_ghast','cushion','minecart']
# Kinds a catalog entry may profile: every kind a ride is classified into except the grab-bag "other".
BAKEABLE=[k for k in SEAT_KINDS if k not in ('none','other')]
# Model pixels, the same unit /pet:seatheight uses; a baked trim is added to the measured lift before the live one.
TRIM_RANGE=(-32,32)
# Model pixels toward the pet's nose (the model faces -z, so the clip negates it); baked into the client animation.
FORWARD_RANGE=(-16,16)
FIELDS={'trim':TRIM_RANGE,'forward':FORWARD_RANGE}

def _number(value,label,low,high,error):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:
        raise error(f'{label} must be a finite number from {low} to {high}')
    return value

def normalize_seating(value,ident,error=ValueError):
    """Validates a pet's optional `seating` block and fills in every kind, so the runtime reads one shape per pet.

    Catalog form: {"kinds": {"pig": {"trim": -2}, "strider": {"trim": 1, "forward": 1}, ...}, "note": "..."}. Only
    bakeable kinds may appear ("other" is every unprofiled mount and stays unbaked); a missing kind or field is zero.
    The result lists every kind but "none", "other" included with zeros, so the generated catalog indexes cleanly by
    kind. `trim` is applied by the scripts through pet:seat_lift; `forward` is compiled into the seat alignment clip.
    """
    value={} if value is None else value
    if not isinstance(value,dict) or not set(value)<={'kinds','note'}:raise error(f'{ident}: seating holds only kinds and note')
    kinds=value.get('kinds',{})
    if not isinstance(kinds,dict):raise error(f'{ident}: seating.kinds must be an object keyed by mount kind')
    unknown=sorted(set(kinds)-set(SEAT_KINDS[1:]))
    if unknown:raise error(f'{ident}: seating.kinds cannot profile {", ".join(unknown)}; bakeable kinds are {", ".join(BAKEABLE)}')
    out={}
    for kind in SEAT_KINDS[1:]:
        entry=kinds.get(kind,{})
        if not isinstance(entry,dict) or not set(entry)<=set(FIELDS):raise error(f'{ident}: seating.kinds.{kind} holds only {", ".join(FIELDS)}')
        out[kind]={field:_number(entry.get(field,0),f'{ident}: seating.kinds.{kind}.{field}',low,high,error) for field,(low,high) in FIELDS.items()}
        # A normalized record round-trips (new_pet.py copies one), but "other" is every unprofiled mount: never baked.
        if kind not in BAKEABLE and any(out[kind].values()):raise error(f'{ident}: seating.kinds.{kind} cannot be baked; bakeable kinds are {", ".join(BAKEABLE)}')
    result={'kinds':out}
    if 'note' in value:
        if not isinstance(value['note'],str):raise error(f'{ident}: seating.note must be a string')
        result['note']=value['note']
    return result
