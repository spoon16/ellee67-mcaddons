// Behaviour locks on the stair-sit pack data, ported from the upstream tools/validate.py. Generic structure
// (manifests, duplicate identifiers, texture references, lang syntax) is covered by tools/validate.ts.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { beforeEach, describe, expect, it } from "vitest";
import { pngSize } from "../../../tools/lib/files.ts";
import { readStrictJson } from "../../../tools/lib/json.ts";
import { packDir } from "../../../tools/lib/packs.ts";

const BP_SOURCE = packDir("stair-sit");
const RP_SOURCE = packDir("stair-sit-resources");

import { reset } from "../../mocks/minecraft-server.ts";

type Json = Record<string, any>;

const bp = (relative: string): Json => readStrictJson(path.join(BP_SOURCE, relative)) as Json;
const rp = (relative: string): Json => readStrictJson(path.join(RP_SOURCE, relative)) as Json;

const seat = bp("entities/seat.json")["minecraft:entity"];
const target = bp("entities/target.json")["minecraft:entity"];
const seatClient = rp("entity/seat.entity.json")["minecraft:client_entity"].description;
const targetClient = rp("entity/target.entity.json")["minecraft:client_entity"].description;

function componentGroupsUsedBy(entity: Json): string[] {
  const names: string[] = [];
  for (const event of Object.values(entity.events) as Json[]) {
    for (const operation of event.sequence ?? [event]) {
      for (const verb of ["add", "remove"]) names.push(...(operation[verb]?.component_groups ?? []));
    }
  }
  return names;
}

beforeEach(() => reset());

describe("stair-sit pack data", () => {
  it("declares the same seat and target identifiers in both packs", () => {
    expect(seat.description.identifier).toBe("sit:seat");
    expect(seatClient.identifier).toBe("sit:seat");
    expect(target.description.identifier).toBe("sit:target");
    expect(targetClient.identifier).toBe("sit:target");
  });

  it("keeps the approved carrier: player-only single seat, tiny non-colliding box, unthrottled spatial updates", () => {
    const rideable = seat.components["minecraft:rideable"];
    expect(rideable.seat_count).toBe(1);
    expect(rideable.family_types).toEqual(["player"]);
    expect(rideable.seats).toEqual([{ position: [0, -0.35, 0], rotate_rider_by: 0 }]);
    expect(rideable.interact_text).toBe("action.interact.sit67");
    expect(seat.components["minecraft:collision_box"]).toEqual({ width: 0.01, height: 0.01 });
    expect(seat.components["minecraft:physics"]).toEqual({ has_gravity: false, has_collision: false });
    expect(seat.components).toHaveProperty("minecraft:transient");
    expect(seat.components["minecraft:conditional_bandwidth_optimization"]).toEqual({
      default_values: { max_dropped_ticks: 0, max_optimized_distance: 80, use_motion_prediction_hints: true },
    });
  });

  it("makes the interaction target a transient, non-rideable, non-colliding hit area", () => {
    expect(target.components).not.toHaveProperty("minecraft:rideable");
    expect(target.components).not.toHaveProperty("minecraft:conditional_bandwidth_optimization");
    expect(target.components).toHaveProperty("minecraft:transient");
    expect(target.components["minecraft:physics"]).toEqual({ has_gravity: false, has_collision: false });
    expect(target.components["minecraft:collision_box"]).toEqual({ width: 0.9, height: 0.6 });
  });

  it("offers the Sit prompt only to empty-handed, upright players on foot or already on our carrier", () => {
    const interactions = target.components["minecraft:interact"].interactions;
    expect(interactions).toHaveLength(1);
    const interaction = interactions[0];
    expect(interaction.interact_text).toBe("action.interact.sit67");
    expect(interaction.cooldown).toBe(0);
    expect(interaction.use_item).toBe(false);
    expect(interaction.swing).toBe(false);
    expect(target.events).toHaveProperty(interaction.on_interact.event);
    const filters = interaction.on_interact.filters.all_of;
    expect(filters).toContainEqual({ test: "is_family", subject: "other", value: "player" });
    expect(filters).toContainEqual({ test: "is_sneaking", subject: "other", value: false });
    expect(filters).toContainEqual({ test: "all_slots_empty", subject: "other", value: "hand" });
    expect(filters).toContainEqual({ test: "has_tag", subject: "other", operator: "!=", value: "ed67_sit_no_button" });
    expect(filters).toContainEqual({
      any_of: [
        { test: "is_riding", subject: "other", value: false },
        { test: "is_vehicle_family", subject: "other", value: "sit_seat" },
      ],
    });
    expect(seat.components["minecraft:type_family"].family).toContain("sit_seat");
  });

  it("only adds and removes component groups that exist", () => {
    for (const entity of [seat, target]) {
      expect(componentGroupsUsedBy(entity).length).toBeGreaterThan(0);
      for (const name of componentGroupsUsedBy(entity)) expect(entity.component_groups).toHaveProperty(name);
    }
  });

  it("wires both client entities to the same invisible geometry, render controller and texture", () => {
    const geometry = rp("models/entity/seat.geo.json")["minecraft:geometry"][0].description.identifier;
    expect(seatClient.geometry.default).toBe(geometry);
    const controllers = rp("render_controllers/seat.render_controllers.json").render_controllers;
    for (const name of seatClient.render_controllers) {
      expect(controllers).toHaveProperty(name);
      expect(controllers[name].part_visibility).toEqual([{ "*": "0.0" }]);
    }
    expect(seatClient.textures).toEqual({ default: "textures/entity/sit_seat" });
    expect(targetClient.geometry).toEqual(seatClient.geometry);
    expect(targetClient.render_controllers).toEqual(seatClient.render_controllers);
    expect(targetClient.textures).toEqual(seatClient.textures);
  });

  it("ships the seat texture as a 16x16 fully transparent PNG", () => {
    for (const texture of Object.values(seatClient.textures) as string[]) {
      const file = path.join(RP_SOURCE, `${texture}.png`);
      expect(pngSize(file)).toEqual({ width: 16, height: 16 });
      const png = PNG.sync.read(fs.readFileSync(file));
      let opaqueBytes = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 0) opaqueBytes++;
      expect(opaqueBytes).toBe(0);
    }
  });
});
