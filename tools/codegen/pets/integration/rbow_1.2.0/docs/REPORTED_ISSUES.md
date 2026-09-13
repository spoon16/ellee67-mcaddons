# User-reported issues addressed by 1.1.5

Status is IMPLEMENTED / CLIENT NOT RUN for this release, not engine-confirmed.

1. Dropped items do not survive blasts: dropped-item immunity intentionally
   withdrawn. Native placed-block immunity retained.
2. Spear is displaced/truncated/too long: custom mesh and pose path removed;
   use ordinary tool rendering (shorter appearance, unchanged gameplay).
3. Deepslate icon is transparent: captured thumbnail removed; use actual opaque
   block geometry/materials for all three block items.
4. Ground items rotate/stack incorrectly and appear flat: ordinary item entities
   replace custom pickup entities. Actual block items use native cube rendering;
   tools/materials/armor keep normal item-style visuals, not block cubes.
5. Ground items have health/hurt when thrown: no new health-bearing carrier is
   created and no drop-damage listener remains. Native blast loss is intentional.
6. First acquisition recipe notice: native unlock conditions expanded to the
   first raw ore or other Rbow item; honor recipe discovery/notification settings.

Compatibility: a small load-only importer releases inventory contents from old
saved pickup entities. It is not a live protection or pickup system. Save/reload
and crash/recovery behavior require testing against a backed-up world.
