// Just enough NBT for the harness: Bedrock's little-endian binary tags, read and written whole. Used to build the
// .mcstructure files the GameTests load and to flip the Beta APIs experiment in a world's level.dat.
export type Tag =
  | { type: "byte"; value: number }
  | { type: "short"; value: number }
  | { type: "int"; value: number }
  | { type: "long"; value: bigint }
  | { type: "float"; value: number }
  | { type: "double"; value: number }
  | { type: "byteArray"; value: Uint8Array }
  | { type: "string"; value: string }
  | { type: "list"; value: Tag[] }
  | { type: "compound"; value: Record<string, Tag> }
  | { type: "intArray"; value: number[] }
  | { type: "longArray"; value: bigint[] };

const TAG_IDS: Record<Tag["type"], number> = {
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  intArray: 11,
  longArray: 12,
};
const TAG_TYPES = Object.fromEntries(Object.entries(TAG_IDS).map(([type, id]) => [id, type])) as Record<
  number,
  Tag["type"]
>;

export const byte = (value: number | boolean): Tag => ({ type: "byte", value: Number(value) });
export const int = (value: number): Tag => ({ type: "int", value });
export const string = (value: string): Tag => ({ type: "string", value });
export const list = (value: Tag[]): Tag => ({ type: "list", value });
export const compound = (value: Record<string, Tag>): Tag => ({ type: "compound", value });

class Reader {
  offset = 0;
  constructor(private readonly buffer: Buffer) {}
  byte(): number {
    return this.buffer.readInt8(this.offset++);
  }
  short(): number {
    const value = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return value;
  }
  int(): number {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }
  long(): bigint {
    const value = this.buffer.readBigInt64LE(this.offset);
    this.offset += 8;
    return value;
  }
  float(): number {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }
  double(): number {
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }
  string(): string {
    const length = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    const value = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  payload(type: Tag["type"]): Tag {
    switch (type) {
      case "byte":
        return { type, value: this.byte() };
      case "short":
        return { type, value: this.short() };
      case "int":
        return { type, value: this.int() };
      case "long":
        return { type, value: this.long() };
      case "float":
        return { type, value: this.float() };
      case "double":
        return { type, value: this.double() };
      case "string":
        return { type, value: this.string() };
      case "byteArray": {
        const length = this.int();
        const value = new Uint8Array(this.buffer.subarray(this.offset, this.offset + length));
        this.offset += length;
        return { type, value };
      }
      case "intArray": {
        const length = this.int();
        return { type, value: Array.from({ length }, () => this.int()) };
      }
      case "longArray": {
        const length = this.int();
        return { type, value: Array.from({ length }, () => this.long()) };
      }
      case "list": {
        const itemType = TAG_TYPES[this.byte()];
        const length = this.int();
        const value: Tag[] = [];
        for (let index = 0; index < length; index++) value.push(this.payload(itemType ?? "byte"));
        return { type, value };
      }
      case "compound": {
        const value: Record<string, Tag> = {};
        for (;;) {
          const id = this.byte();
          if (id === 0) break;
          const name = this.string();
          value[name] = this.payload(TAG_TYPES[id] as Tag["type"]);
        }
        return { type, value };
      }
    }
  }
}

class Writer {
  private chunks: Buffer[] = [];
  private scratch(size: number, fill: (buffer: Buffer) => void): void {
    const buffer = Buffer.alloc(size);
    fill(buffer);
    this.chunks.push(buffer);
  }
  byte(value: number): void {
    this.scratch(1, (buffer) => buffer.writeInt8(value));
  }
  short(value: number): void {
    this.scratch(2, (buffer) => buffer.writeInt16LE(value));
  }
  int(value: number): void {
    this.scratch(4, (buffer) => buffer.writeInt32LE(value));
  }
  long(value: bigint): void {
    this.scratch(8, (buffer) => buffer.writeBigInt64LE(value));
  }
  float(value: number): void {
    this.scratch(4, (buffer) => buffer.writeFloatLE(value));
  }
  double(value: number): void {
    this.scratch(8, (buffer) => buffer.writeDoubleLE(value));
  }
  string(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    this.scratch(2, (buffer) => buffer.writeUInt16LE(bytes.length));
    this.chunks.push(bytes);
  }
  payload(tag: Tag): void {
    switch (tag.type) {
      case "byte":
        this.byte(tag.value);
        return;
      case "short":
        this.short(tag.value);
        return;
      case "int":
        this.int(tag.value);
        return;
      case "long":
        this.long(tag.value);
        return;
      case "float":
        this.float(tag.value);
        return;
      case "double":
        this.double(tag.value);
        return;
      case "string":
        this.string(tag.value);
        return;
      case "byteArray":
        this.int(tag.value.length);
        this.chunks.push(Buffer.from(tag.value));
        return;
      case "intArray":
        this.int(tag.value.length);
        for (const value of tag.value) this.int(value);
        return;
      case "longArray":
        this.int(tag.value.length);
        for (const value of tag.value) this.long(value);
        return;
      case "list": {
        const first = tag.value[0];
        this.byte(first ? TAG_IDS[first.type] : 0);
        this.int(tag.value.length);
        for (const item of tag.value) this.payload(item);
        return;
      }
      case "compound":
        for (const [name, child] of Object.entries(tag.value)) {
          this.byte(TAG_IDS[child.type]);
          this.string(name);
          this.payload(child);
        }
        this.byte(0);
        return;
    }
  }
  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/** Reads one named root tag (a .mcstructure file, or a level.dat body). Returns its name and the tag. */
export function readNbt(buffer: Buffer): { name: string; root: Tag } {
  const reader = new Reader(buffer);
  const type = TAG_TYPES[reader.byte()] as Tag["type"];
  const name = reader.string();
  return { name, root: reader.payload(type) };
}

export function writeNbt(root: Tag, name = ""): Buffer {
  const writer = new Writer();
  writer.byte(TAG_IDS[root.type]);
  writer.string(name);
  writer.payload(root);
  return writer.bytes();
}

/** level.dat is an 8-byte header (storage version, body length) followed by an unnamed-root NBT body. */
export function readLevelDat(file: Buffer): { storageVersion: number; root: Tag } {
  const storageVersion = file.readInt32LE(0);
  const length = file.readInt32LE(4);
  return { storageVersion, root: readNbt(file.subarray(8, 8 + length)).root };
}

export function writeLevelDat(storageVersion: number, root: Tag): Buffer {
  const body = writeNbt(root);
  const header = Buffer.alloc(8);
  header.writeInt32LE(storageVersion, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export interface StructureBlock {
  name: string;
  states?: Record<string, Tag>;
}

/**
 * Builds an .mcstructure: a box of `size` blocks where `blockAt(x, y, z)` names each block (undefined for air).
 * The engine reads block_indices as two layers (blocks and the waterlog layer, -1 for none) in x, y, z order.
 */
export function buildStructure(
  size: [number, number, number],
  blockAt: (x: number, y: number, z: number) => StructureBlock | undefined,
): Buffer {
  const palette: StructureBlock[] = [{ name: "minecraft:air" }];
  const keyOf = (block: StructureBlock) => JSON.stringify([block.name, block.states ?? {}]);
  const indexOf = new Map<string, number>([[keyOf(palette[0] as StructureBlock), 0]]);
  const indices: number[] = [];
  for (let x = 0; x < size[0]; x++)
    for (let y = 0; y < size[1]; y++)
      for (let z = 0; z < size[2]; z++) {
        const block = blockAt(x, y, z);
        if (!block) {
          indices.push(0);
          continue;
        }
        const key = keyOf(block);
        let index = indexOf.get(key);
        if (index === undefined) {
          index = palette.length;
          palette.push(block);
          indexOf.set(key, index);
        }
        indices.push(index);
      }
  const root = compound({
    format_version: int(1),
    size: list(size.map(int)),
    structure: compound({
      block_indices: list([list(indices.map(int)), list(indices.map(() => int(-1)))]),
      entities: list([]),
      palette: compound({
        default: compound({
          block_palette: list(
            palette.map((block) =>
              compound({ name: string(block.name), states: compound(block.states ?? {}), version: int(18168865) }),
            ),
          ),
          block_position_data: compound({}),
        }),
      }),
    }),
    structure_world_origin: list([int(0), int(0), int(0)]),
  });
  return writeNbt(root);
}
