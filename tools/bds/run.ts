// Starts Bedrock Dedicated Server, feeds it console commands once it reports "Server started.", stops it, and
// returns everything it printed. The server reads commands from stdin and writes its log and the content log to
// stdout, which is all the harness needs.
import { spawn } from "node:child_process";
import path from "node:path";
import { SERVER_DIR, serverEnvironment } from "./setup.ts";

export interface RunOptions {
  /** Console commands, sent one at a time after the world has settled. */
  commands?: string[];
  /** Wait after "Server started." before the first command: the world is still loading chunks. */
  warmUpMs?: number;
  /** Wait between commands and after the last one, so replies land in the log before the stop. */
  commandGapMs?: number;
  /** Hard limit for the whole run; the server is stopped when it passes. */
  timeoutMs?: number;
  onLine?: (line: string) => void;
}

export interface RunResult {
  lines: string[];
  started: boolean;
  exitCode: number | null;
  timedOut: boolean;
}

export const STARTED = /Server started\./;

export function runServer(serverDir = SERVER_DIR, options: RunOptions = {}): Promise<RunResult> {
  const { commands = [], warmUpMs = 3000, commandGapMs = 3000, timeoutMs = 120_000 } = options;
  return new Promise((resolve) => {
    const child = spawn(path.join(serverDir, "bedrock_server"), [], {
      cwd: serverDir,
      env: { ...process.env, ...serverEnvironment() },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const result: RunResult = { lines: [], started: false, exitCode: null, timedOut: false };
    let stopping = false;
    let buffered = "";
    const stop = () => {
      if (stopping) return;
      stopping = true;
      child.stdin.write("stop\n");
      setTimeout(() => child.kill("SIGKILL"), 30_000).unref();
    };
    const drive = async () => {
      await sleep(warmUpMs);
      for (const command of commands) {
        child.stdin.write(`${command}\n`);
        await sleep(commandGapMs);
      }
      stop();
    };
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString();
      const parts = buffered.split(/\r?\n/);
      buffered = parts.pop() ?? "";
      for (const line of parts) {
        result.lines.push(line);
        options.onLine?.(line);
        if (!result.started && STARTED.test(line)) {
          result.started = true;
          void drive();
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      result.timedOut = true;
      stop();
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (buffered) result.lines.push(buffered);
      result.exitCode = code;
      resolve(result);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
