import { createServer } from "node:http";
import { spawn } from "node:child_process";
const RD = process.argv[2];
const hits = [];
const server = createServer((req, res) => {
  hits.push(`${req.method} ${req.headers.host}${req.url}`);
  res.writeHead(200, { "content-type": "application/json" });
  res.end("{}");
});
await new Promise((r) => server.listen(8899, "127.0.0.1", r));
const child = spawn(`${RD}/runtime/node`, [`${RD}/runtime/server-cli.js`, "doctor", "--json"], {
  env: { ...process.env, HOME: "/home/jame", ZCODE_BASE_URL: "http://127.0.0.1:8899/ignored/path", ZCODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (c) => (out += c));
child.stderr.on("data", (c) => (out += c));
const code = await new Promise((r) => child.on("exit", r));
server.close();
console.log("exit:", code);
console.log("hits:", JSON.stringify(hits.slice(0, 10), null, 1));
console.log("output head:", out.slice(0, 500).replace(/\n/g, " | "));
process.exit(0);
