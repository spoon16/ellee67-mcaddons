/** Explicitly requested stationary test props. Not substitutes for the player. */
export const PROBE_TYPES = Object.freeze(['pet:diag_cube', 'pet:diag_model']);
export const OWNER_KEY = 'pet:probe_owner';
// Loaded diagnostic props created by earlier builds can still be cleaned up safely.
export const LEGACY_PROBE_TYPES = Object.freeze(['cav:diag_cube', 'cav:diag_model']);
export const LEGACY_OWNER_KEY = 'cav:probe_owner';
const DIMENSIONS = ['overworld', 'nether', 'the_end'];

export function positionsFor(player) {
  const p = player.location;
  const v = player.getViewDirection();
  const length = Math.hypot(v.x, v.z);
  if (!Number.isFinite(length) || length < 0.05) throw new Error('Look horizontally across open, level ground, then retry /pet:probe.');
  const forward = {x: v.x / length, z: v.z / length};
  const right = {x: -forward.z, z: forward.x};
  return [-1, 1].map(side => ({
    x: p.x + forward.x * 3.5 + right.x * 1.0 * side,
    y: p.y + 0.05,
    z: p.z + forward.z * 3.5 + right.z * 1.0 * side
  }));
}

export function cleanupProbes(world, playerId) {
  let removed = 0;
  const errors = [];
  for (const dimensionId of DIMENSIONS) {
    try {
      const dimension = world.getDimension(dimensionId);
      for (const type of [...PROBE_TYPES, ...LEGACY_PROBE_TYPES]) {
        const ownerKey = LEGACY_PROBE_TYPES.includes(type) ? LEGACY_OWNER_KEY : OWNER_KEY;
        for (const entity of dimension.getEntities({type})) {
          try {
            if (entity.getDynamicProperty(ownerKey) === playerId) {entity.remove(); removed++;}
          } catch (error) { errors.push(String(error)); }
        }
      }
    } catch (error) {errors.push(`${dimensionId}: ${String(error)}`);}
  }
  return {removed, errors};
}

export function spawnProbes(world, player) {
  const positions = positionsFor(player);
  // No force-loading or editing blocks. Abort before spawning if the target space is occupied.
  for (const pos of positions) {
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.75, 0.75]) for (const dy of [0.0, 0.8, 1.3]) {
      const block = player.dimension.getBlock({x: Math.floor(pos.x+dx), y: Math.floor(pos.y+dy), z: Math.floor(pos.z+dz)});
      if (!block?.isAir) throw new Error('The probe area is not clear. Stand on open, level ground with at least five clear blocks ahead.');
    }
  }
  const clean = cleanupProbes(world, player.id);
  if (clean.errors.length) throw new Error(`Could not safely clear the old probe pair: ${clean.errors.join('; ')}`);
  const made = [];
  try {
    PROBE_TYPES.forEach((type, i) => {
      const entity = player.dimension.spawnEntity(type, positions[i]);
      made.push(entity); // Track immediately, so a later assignment error still gets cleaned up.
      entity.setDynamicProperty(OWNER_KEY, player.id);
      entity.nameTag = i === 0 ? 'Pets R6 cube' : 'Carter - static test model';
      entity.setRotation({x:0, y:player.getRotation().y + 180});
    });
    return made.map((e,i) => ({id: e.id, type: PROBE_TYPES[i], location: positions[i]}));
  } catch (error) {
    for (const e of made) {try {e.remove();} catch { /* Native expiry timer remains a backup. */ }}
    throw error;
  }
}
