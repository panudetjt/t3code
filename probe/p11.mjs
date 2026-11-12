import { spawn } from "node:child_process";

const [releaseDir, requestedMode] = process.argv.slice(2);
const WS = "/tmp/opencode/zprobe/ws";

const child = spawn(`${releaseDir}/runtime/node`, [`${releaseDir}/runtime/server-cli.js`, "app-server", "--stdio"], {
  env: {
    ...process.env,
    HOME: "/home/jame",
    ZCODE_DATA_BASE_DIR: "/tmp/opencode/zprobe/data",
    ...(process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE
      ? { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE }
      : {}),
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const waiters = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.id !== undefined && rec.method !== undefined) {
      const result = rec.method === "session/requestRuntimePreferences"
        ? { nativeSearchEnhancementsEnabled: false, toolSearchMode: "off", memoryEnabled: false, askUserQuestionAutoResolutionEnabled: true, modelContextBudgetStrategy: "preflight-v1" }
        : {};
      child.stdin.write(JSON.stringify({ id: rec.id, result }) + "\n");
      continue;
    }
    if (rec.id !== undefined && waiters.has(rec.id)) { waiters.get(rec.id)(rec); waiters.delete(rec.id); }
  }
});
child.stderr.on("data", () => {});
let nextId = 1;
const call = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  waiters.set(id, resolve);
  child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); resolve({ timeout: true }); } }, 20000);
});

await new Promise((r) => setTimeout(r, 2500));
const created = await call("session/create", {
  workspace: { workspacePath: WS, workspaceKey: WS },
  mode: requestedMode,
  titleGenerationEnabled: false,
});
const sessionId = created?.result?.session?.sessionId;
const read1 = await call("session/read", { sessionId });
const resumed = await call("session/resume", { sessionId });
const read2 = await call("session/read", { sessionId });
console.log(JSON.stringify({
  release: releaseDir.split("/").pop(),
  requestedMode,
  createReturnedMode: created?.result?.session?.mode ?? null,
  readAfterCreate: read1?.result?.session?.mode ?? null,
  resumeInSameProcess: resumed?.error ? { error: resumed.error.code } : { mode: resumed?.result?.session?.mode ?? null },
  readAfterResume: read2?.result?.session?.mode ?? null,
}));
child.kill();
process.exit(0);
