"""Mount kinds the seating scripts classify a ride into.

The list index is the wire value of the client-synced `pet:seat_kind` property (0, "none", is not
mounted), so entries are only ever appended: saved seat trims and the client animation are keyed
by name and index respectively. The runtime reads the same list from catalog.generated.js.
"""
SEAT_KINDS=['none','boat','pig','stairs','other','horse','strider','happy_ghast','cushion']
