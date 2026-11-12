import { spawn } from "node:child_process";

const [releaseDir, ...methods] = process.argv.slice(2);
const child = spawn(`${releaseDir}/runtime/node`, [`${releaseDir}/runtime/server-cli.js`, "app-server", "--stdio"], {
  env: {
    ...process.env,
    HOME: "/tmp/opencode/zprobe/home",
    ZCODE_DATA_BASE_DIR: "/tmp/opencode/zprobe/data",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const pending = new Map();
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
      // server->client request; answer generically so the CLI keeps going
      child.stdin.write(JSON.stringify({ id: rec.id, result: {} }) + "\n");
      console.log("SERVER-REQ", rec.method);
      continue;
    }
    console.log("REC", JSON.stringify(rec).slice(0, 600));
  }
});
child.stderr.on("data", (c) => console.log("ERR", c.toString().slice(0, 300)));
child.on("exit", (code) => console.log("EXIT", code));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");
await new Promise((r) => setTimeout(r, 1500));
for (const [index, method] of methods.entries()) {
  send({ id: 100 + index, method, params: { sessionId: "does-not-exist", mode: "guarded" } });
}
await new Promise((r) => setTimeout(r, 4000));
child.kill();
process.exit(0);
