import { spawn } from "node:child_process";

const releaseDir = process.argv[2];
const methods = process.argv.slice(3);
const child = spawn(`${releaseDir}/runtime/node`, [`${releaseDir}/runtime/server-cli.js`, "app-server", "--stdio"], {
  env: {
    ...process.env,
    HOME: "/home/jame",
    ZCODE_DATA_BASE_DIR: "/tmp/opencode/zprobe/data",
    ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: "/home/jame/.zcode/v2/runtime/provider/linux-x86_64/3.17.2/endpoint-78d7c3bef4024722642626fe3669a799/zcode-builtin.json",
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: "/home/jame/.zcode/v2/provider_config.json",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
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
      child.stdin.write(JSON.stringify({ id: rec.id, result: {} }) + "\n");
      console.log("SERVER-REQ", rec.method);
      continue;
    }
    if (rec.id === undefined) continue;
    console.log("REPLY", JSON.stringify(rec).slice(0, 700));
  }
});
child.stderr.on("data", (c) => console.log("ERR", c.toString().slice(0, 300)));
child.on("exit", (code) => console.log("EXIT", code));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
await new Promise((r) => setTimeout(r, 2500));
for (const [index, method] of methods.entries()) {
  send({ id: 100 + index, method, params: { sessionId: "does-not-exist", mode: "guarded" } });
}
await new Promise((r) => setTimeout(r, 5000));
child.kill();
process.exit(0);
