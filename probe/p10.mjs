import { spawn } from "node:child_process";

const [releaseDir, phase, mode, sessionIdArg] = process.argv.slice(2);
const WS = "/tmp/opencode/zprobe/ws";
const BUILTIN = process.env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE;

const child = spawn(`${releaseDir}/runtime/node`, [`${releaseDir}/runtime/server-cli.js`, "app-server", "--stdio"], {
  env: {
    ...process.env,
    HOME: "/home/jame",
    ZCODE_DATA_BASE_DIR: "/tmp/opencode/zprobe/data",
    ...(BUILTIN ? { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: BUILTIN } : {}),
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
      const result =
        rec.method === "session/requestRuntimePreferences"
          ? { nativeSearchEnhancementsEnabled: false, toolSearchMode: "off", memoryEnabled: false, askUserQuestionAutoResolutionEnabled: true, modelContextBudgetStrategy: "preflight-v1" }
          : {};
      child.stdin.write(JSON.stringify({ id: rec.id, result }) + "\n");
      continue;
    }
    if (rec.id !== undefined && waiters.has(rec.id)) {
      waiters.get(rec.id)(rec);
      waiters.delete(rec.id);
    }
  }
});
child.stderr.on("data", () => {});

let nextId = 1;
const call = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiters.set(id, resolve);
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    setTimeout(() => {
      if (waiters.has(id)) {
        waiters.delete(id);
        resolve({ timeout: true });
      }
    }, 20000);
  });

const brief = (r) =>
  r.timeout
    ? { timeout: true }
    : r.error
      ? { error: { code: r.error.code, message: String(r.error.message).slice(0, 120) } }
      : { result: Object.keys(r.result ?? {}).slice(0, 6) };

await new Promise((r) => setTimeout(r, 2500));
const out = { release: releaseDir.split("/").pop(), phase };

if (phase === "create") {
  const created = await call("session/create", {
    workspace: { workspacePath: WS, workspaceKey: WS },
    mode: "guarded",
    titleGenerationEnabled: false,
  });
  const sessionId = created?.result?.session?.sessionId;
  out.create = { mode: created?.result?.session?.mode, sessionId };
  out.setMode = brief(await call("session/setMode", { sessionId, mode: mode ?? "yolo" }));
  const read = await call("session/read", { sessionId });
  out.afterSetMode = { mode: read?.result?.session?.mode };
  out.resumeWithMode = brief(await call("session/resume", { sessionId, mode: "guarded" }));
  out.unknownMethod = brief(await call("session/doesNotExist", { sessionId }));
  console.log(JSON.stringify(out));
} else {
  const resumed = await call("session/resume", { sessionId: sessionIdArg });
  out.resume = brief(resumed);
  out.modeAfterResume = resumed?.result?.session?.mode ?? null;
  const read = await call("session/read", { sessionId: sessionIdArg });
  out.readAfterResume = read?.result?.session?.mode ?? null;
  console.log(JSON.stringify(out));
}

child.kill();
process.exit(0);
