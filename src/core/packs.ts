import packsJson from "../../packs.json";

/** One pack from packs.json, as the manual and the commands describe it to players. */
export interface PackInfo {
  id: string;
  kind: "behavior" | "resources";
  title: string;
  description: string;
  feature: string | null;
  dependsOn: string[];
}

export const packs: readonly PackInfo[] = packsJson.packs.map((pack) => ({
  id: pack.id,
  kind: pack.kind as PackInfo["kind"],
  title: pack.title,
  description: pack.description,
  feature: pack.feature,
  dependsOn: pack.dependsOn,
}));

export function packTitle(id: string): string {
  return packs.find((pack) => pack.id === id)?.title ?? id;
}

export function packsForFeature(featureId: string): PackInfo[] {
  return packs.filter((pack) => pack.feature === featureId);
}

function describePacks(ids: readonly string[]): string {
  const parts = ids.map((id) => {
    const pack = packs.find((candidate) => candidate.id === id);
    const where = pack?.kind === "resources" ? "Resource Packs" : "Behavior Packs";
    return `"${pack?.title ?? id}" (${where})`;
  });
  return parts.join(" and ");
}

/** How to turn a pack-backed feature on or off, in the words the manual and the commands use. */
export function activationHint(featureTitle: string, packIds: readonly string[], turnOn: boolean): string {
  const behavior = packIds.filter((id) => packs.find((pack) => pack.id === id)?.kind !== "resources");
  const listed = turnOn ? describePacks(behavior.length ? behavior : packIds) : describePacks(packIds);
  if (turnOn) {
    const auto = packIds.length > behavior.length ? " Its resource pack is added automatically." : "";
    return `${featureTitle} is turned on by activating ${listed} in Edit World.${auto}`;
  }
  return `${featureTitle} is turned off by deactivating ${listed} in Edit World.`;
}
