import { spawn } from "node:child_process";
export const startCli = async (releaseDir) => {
  const child = spawn(`${releaseDir}/runtime/node`, [`${releaseDir}/runtime/server-cli.js`, "app-server", "--stdio"], {
    env: { ...process.env, HOME: "/home/jame", ZCODE_DATA_BASE_DIR: "/tmp/opencode/zprobe/data",
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "/home/jame/.zcode/v2/runtime/provider/linux-x86_64/3.17.2/endpoint-78d7c3bef4024722642626fe3669a799/zcode-builtin.json",
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: "/home/jame/.zcode/v2/provider_config.json" },
    stdio: ["pipe", "pipe", "pipe"] });
  let buf = ""; const waiters = new Map(); const notifications = [];
  child.stdout.on("data", (chunk) => { buf += chunk.toString(); let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      if (rec.id !== undefined && rec.method !== undefined) {
        const result = rec.method === "session/requestRuntimePreferences"
          ? { nativeSearchEnhancementsEnabled: false, toolSearchMode: "off", memoryEnabled: false, askUserQuestionAutoResolutionEnabled: true, modelContextBudgetStrategy: "preflight-v1" } : {};
        child.stdin.write(JSON.stringify({ id: rec.id, result }) + "\n"); continue; }
      if (rec.id !== undefined && waiters.has(rec.id)) { waiters.get(rec.id)(rec); waiters.delete(rec.id); }
      else if (rec.method) notifications.push(rec); } });
  child.stderr.on("data", () => {});
  let nextId = 1;
  const call = (method, params) => new Promise((resolve) => { const id = nextId++; waiters.set(id, resolve);
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); resolve({ timeout: true }); } }, 20000); });
  await new Promise((r) => setTimeout(r, 2500));
  return { child, call, notifications };
};
