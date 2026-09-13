/** Read-only inspection of the properties actually exposed by the current entity.
 * Does not infer active packs, manufacture defaults, repair schemas or change preferences.
 * Missing reads remain explicit nulls with status=missing, never a false Player success.
 */
import { BUILD, MODEL_BY_WIRE } from "./catalog.generated.ts";
import type { PlayerLike } from "./core.ts";
import { PROPERTY_SCHEMA, PROPERTY_SCHEMA_SHA256 } from "./property_schema.generated.ts";

const MODEL = "pet:model_id";

export type PropertyValue = boolean | number | string;

export interface PropertyDefinition {
  type: string;
  values?: readonly string[];
  range?: readonly number[];
  default: PropertyValue;
  client_sync: boolean;
}

export interface Observation {
  status: "ok" | "missing" | "invalid" | "read_error";
  value: PropertyValue | null;
  actualType?: string;
  error?: string;
}

export interface PropertyReport {
  status: string;
  expected: number;
  validCount: number;
  missing: string[];
  invalid: string[];
  readErrors: string[];
  properties: Record<string, Observation>;
  model: PropertyValue | null;
  modelStatus: string;
  serverForm: string | null;
  schema: string;
}

export interface FailureRecord {
  tick: number;
  source: string;
  message: string;
  status: string;
  model: PropertyValue | null;
  modelStatus: string;
  missing: string[];
  invalid: string[];
  readErrors: string[];
}

/** The preflight error: `propertyReport` carries the inspection that rejected the write. */
export class PetPropertyStateError extends Error {
  readonly propertyReport: PropertyReport;
  constructor(message: string, propertyReport: PropertyReport) {
    super(message);
    this.name = "PetPropertyStateError";
    this.propertyReport = propertyReport;
  }
}

const schema: Readonly<Record<string, PropertyDefinition>> = PROPERTY_SCHEMA;
export const PROPERTY_KEYS: readonly string[] = Object.freeze(Object.keys(PROPERTY_SCHEMA));

function validValue(value: PropertyValue, definition: PropertyDefinition | undefined): boolean {
  if (!definition) return true;
  if (definition.type === "bool") return typeof value === "boolean";
  if (definition.type === "enum") {
    return typeof value === "string" && definition.values !== undefined && definition.values.includes(value);
  }
  if (definition.type === "int" && !Number.isInteger(value)) return false;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (!definition.range) return true;
  const [low, high] = definition.range;
  return low !== undefined && high !== undefined && value >= low && value <= high;
}
export function observeProperty(player: PlayerLike, key: string): Observation {
  try {
    const value = player.getProperty(key);
    if (value === undefined) return { status: "missing", value: null };
    // Primitive snapshots only: preserve type errors without risking a JSON failure.
    const primitive =
      typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
        ? value
        : null;
    const valid = primitive !== null && validValue(primitive, schema[key]);
    return { status: valid ? "ok" : "invalid", value: primitive, ...(valid ? {} : { actualType: typeof value }) };
  } catch (error) {
    return { status: "read_error", value: null, error: error instanceof Error ? error.message : String(error) };
  }
}
/** The form a valid model value denotes, or null when no catalog model carries that wire id. */
function registeredForm(value: PropertyValue | null): string | null {
  if (value === 0) return "player";
  const pet = MODEL_BY_WIRE[String(value)];
  return pet && Object.hasOwn(MODEL_BY_WIRE, String(value)) ? pet.id : null;
}
export function inspectProperties(player: PlayerLike, keys: readonly string[] = PROPERTY_KEYS): PropertyReport {
  const properties: Record<string, Observation> = Object.fromEntries(keys.map((k) => [k, observeProperty(player, k)]));
  const missing = keys.filter((k) => properties[k]?.status === "missing");
  const invalid = keys.filter((k) => properties[k]?.status === "invalid");
  const readErrors = keys.filter((k) => properties[k]?.status === "read_error");
  const validCount = keys.filter((k) => properties[k]?.status === "ok").length;
  let status = readErrors.length
    ? "READ_ERROR"
    : invalid.length
      ? "INVALID_VALUES"
      : missing.length === keys.length && keys.length
        ? "MISSING_DEFINITION"
        : missing.length
          ? "PARTIAL_DEFINITION"
          : "READY";
  const model = properties[MODEL];
  const serverForm = model?.status === "ok" ? registeredForm(model.value) : null;
  if (status === "READY" && model && serverForm === null) status = "UNREGISTERED_MODEL";
  return {
    status,
    expected: keys.length,
    validCount,
    missing,
    invalid,
    readErrors,
    properties,
    model: model?.value ?? null,
    modelStatus: model?.status ?? "not_checked",
    serverForm,
    schema: PROPERTY_SCHEMA_SHA256,
  };
}
export function requireProperties(
  player: PlayerLike,
  keys: readonly string[] = PROPERTY_KEYS,
): Record<string, PropertyValue> {
  const report = inspectProperties(player, keys);
  if (report.missing.length || report.invalid.length || report.readErrors.length) {
    const [readError] = report.readErrors;
    const [missing] = report.missing;
    const [invalid] = report.invalid;
    let message: string;
    if (readError !== undefined) {
      message = `Cannot read ${readError} from this entity (${report.properties[readError]?.error}).`;
    } else if (missing !== undefined) {
      message = `${missing} is missing from this player entity (${report.validCount}/${report.expected} required values readable).`;
    } else message = `Invalid ${invalid} value on this player entity.`;
    message +=
      " Pack activation alone does not verify the loaded player definition. A conflicting/old definition or a load error can cause this; run /pet:check.";
    throw new PetPropertyStateError(message, report);
  }
  const values: Record<string, PropertyValue> = {};
  for (const key of keys) {
    const value = report.properties[key]?.value;
    if (value !== null && value !== undefined) values[key] = value;
  }
  return values;
}
const failures = new Map<string, FailureRecord>();
export function rememberFailure(
  player: PlayerLike | undefined,
  error: unknown,
  tick: number,
  source = "command",
): void {
  if (!player?.id) return;
  // No references to live entity or inventory objects are retained.
  const report = error instanceof PetPropertyStateError ? error.propertyReport : inspectProperties(player);
  failures.set(player.id, {
    tick,
    source,
    message: error instanceof Error ? error.message : String(error),
    status: report.status,
    model: report.model,
    modelStatus: report.modelStatus,
    missing: [...report.missing],
    invalid: [...report.invalid],
    readErrors: [...report.readErrors],
  });
}
export function lastFailure(player: Pick<PlayerLike, "id">): FailureRecord | null {
  return failures.get(player.id) ?? null;
}
export function forgetFailure(id: string): void {
  failures.delete(id);
}
export function checkLines(player: PlayerLike, tick: number): { report: PropertyReport; lines: string[] } {
  const report = inspectProperties(player);
  const failure = lastFailure(player);
  const model = report.modelStatus === "ok" ? String(report.model) : report.modelStatus.toUpperCase();
  const lines = [
    `Pets ${BUILD} | ${report.status} | ${report.validCount}/${report.expected} valid properties`,
    `pet:model_id=${model} | observed form=${report.serverForm ?? "UNAVAILABLE"} | tick=${tick}`,
  ];
  if (report.missing.length) lines.push(`Missing: ${report.missing.join(", ")}`);
  if (report.invalid.length) lines.push(`Invalid: ${report.invalid.join(", ")}`);
  if (report.readErrors.length) {
    lines.push(`Read errors: ${report.readErrors.map((k) => `${k}: ${report.properties[k]?.error}`).join("; ")}`);
  }
  if (failure) {
    lines.push(
      `Last failure (${failure.source}, tick ${failure.tick}): ${failure.status}; model=${failure.modelStatus === "ok" ? failure.model : failure.modelStatus}.`,
    );
  }
  lines.push("Server property check only. /pet:clientcheck checks the resource-language version.");
  return { report, lines };
}
