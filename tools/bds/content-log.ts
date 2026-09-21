// The Content Log Bedrock writes beside the server binary, one ContentLog<timestamp>.txt per boot: the same log the
// Content Log GUI shows on a player's screen. Its warnings and errors are on-screen text when a world opens, so both
// engine harnesses fail on any of them.
import fs from "node:fs";
import path from "node:path";

const CONTENT_LOG = /^ContentLog.*\.txt$/;

/** Removes every content log from earlier runs, so the one read afterwards can only be this run's. */
export function clearContentLogs(serverDir: string): void {
  for (const name of fs.readdirSync(serverDir)) if (CONTENT_LOG.test(name)) fs.rmSync(path.join(serverDir, name));
}

/** The content log this run wrote, or undefined when the server wrote none (itself a failure). */
export function contentLog(serverDir: string): string[] | undefined {
  const files = fs
    .readdirSync(serverDir)
    .filter((name) => CONTENT_LOG.test(name))
    .sort();
  const latest = files[files.length - 1];
  return latest ? fs.readFileSync(path.join(serverDir, latest), "utf8").split(/\r?\n/) : undefined;
}

/** The lines the Content Log GUI puts on screen: warnings and errors, whichever system wrote them. */
export function contentProblems(lines: string[]): string[] {
  return lines.filter((line) => /\[(error|warning)\]/.test(line));
}
