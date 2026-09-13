import fs from "node:fs";
import path from "node:path";

/** Every file below `root`, as forward-slash paths relative to `root`, sorted. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  visit(root);
  return out.sort();
}

export function copyTree(from: string, to: string): void {
  fs.cpSync(from, to, { recursive: true });
}

export function pngSize(file: string): { width: number; height: number } {
  const buffer = fs.readFileSync(file);
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error(`${file}: not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
