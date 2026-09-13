/** Pure form/state helpers. No global entity transforms or inventory mutations. */
export const BUILD = "0.2.1-paw-grip-fix.1";
export const FORM_PROPERTY = "pet:form";
export const PREFERENCE = "pet:preferred_form";
export const DEBUG_PROPERTY = "pet:debug";
export const SNAPSHOT = "pet:inventory_snapshot";
// Read-only compatibility keys from 0.1.0-0.1.2. The pack header UUID is unchanged.
export const LEGACY_PREFERENCE = "cav:preferred_form";
export const LEGACY_SNAPSHOT = "cav:inventory_snapshot";
export const FORMS = Object.freeze(["human", "carter"]);

export function validateForm(value) {
  if (!FORMS.includes(value)) throw new Error("Expected human or carter.");
  return value;
}
function legacyPreferredForm(player) {
  const value = player.getDynamicProperty(LEGACY_PREFERENCE);
  if (value === "cavalier") return "carter";
  return value === "human" ? "human" : undefined;
}
/** Read-only: diagnostics must never migrate data just by inspecting it. */
export function preferredForm(player) {
  const value = player.getDynamicProperty(PREFERENCE);
  // Any explicitly present new value takes precedence, even if invalid.
  // This prevents an old Cavalier preference from resurrecting after a reset.
  if (value !== undefined) return FORMS.includes(value) ? value : "human";
  return legacyPreferredForm(player) ?? "human";
}
export function needsPreferenceMigration(player) {
  return player.getDynamicProperty(PREFERENCE) === undefined &&
    legacyPreferredForm(player) !== undefined;
}
export function isPlayer(entity) {
  try { return entity?.typeId === "minecraft:player" && entity.isValid !== false; }
  catch { return false; }
}
export function safeMessage(player, text) {
  try { player.sendMessage(`[ElleeDog 67 Pets ${BUILD}] ${text}`); } catch { /* Player may have left. */ }
}

/** The caller runs in writable execution, not a before-event command callback. */
export function applyForm(player, form, persist = true) {
  validateForm(form);
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const previous = player.getProperty(FORM_PROPERTY);
  if (!FORMS.includes(previous)) {
    throw new Error("pet:form is missing. Enable the ElleeDog 67 Pets behavior pack; remove conflicting player packs.");
  }
  // setProperty is deferred by Minecraft. Do not assume getProperty changes in this tick.
  player.setProperty(FORM_PROPERTY, form);
  if (persist) {
    try { player.setDynamicProperty(PREFERENCE, form); }
    catch (error) {
      try { player.setProperty(FORM_PROPERTY, previous); } catch { /* Original error wins. */ }
      throw error;
    }
  }
  return form;
}

export function itemSummary(item) {
  if (!item) return null;
  const durability = item.getComponent("minecraft:durability");
  const enchantable = item.getComponent("minecraft:enchantable");
  const enchantments = (enchantable?.getEnchantments() ?? [])
    .map(e => [e.type.id, e.level]).sort((a, b) => a[0].localeCompare(b[0]));
  const dynamic = {};
  for (const key of (item.getDynamicPropertyIds?.() ?? []).slice().sort()) {
    dynamic[key] = item.getDynamicProperty(key);
  }
  return {
    type: item.typeId, amount: item.amount, name: item.nameTag ?? "",
    lore: item.getLore(), damage: durability?.damage ?? null,
    enchantments, dynamic
  };
}

/** A read-only diagnostic comparison, not a full serialization of all native item data. */
export function captureInventory(player, equipmentSlots) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) throw new Error("Player inventory is not available.");
  const items = [];
  for (let index = 0; index < inventory.size; index++) items.push(itemSummary(inventory.getItem(index)));
  const equipment = {};
  const equippable = player.getComponent("minecraft:equippable");
  for (const [label, slot] of Object.entries(equipmentSlots)) {
    equipment[label] = itemSummary(equippable?.getEquipment(slot));
  }
  return { items, equipment };
}
export function compareInventory(before, after) {
  const changed = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const count = Math.max(before.items.length, after.items.length);
  for (let i = 0; i < count; i++) if (!same(before.items[i], after.items[i])) changed.push(`inventory:${i}`);
  for (const key of new Set([...Object.keys(before.equipment), ...Object.keys(after.equipment)])) {
    if (!same(before.equipment[key], after.equipment[key])) changed.push(`equipment:${key}`);
  }
  return changed;
}

/** Keeps deferred callbacks for a disconnected player from touching a new session. */
export function createSessionGuard() {
  const generation = new Map();
  let sequence = 0; // Never reuse an ID after disconnect/reconnect (ABA protection).
  return {
    next(id) { const n = ++sequence; generation.set(id, n); return n; },
    current(id, n) { return generation.get(id) === n; },
    remove(id) { generation.delete(id); }
  };
}
