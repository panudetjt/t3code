import { connect } from "./channel.mjs";
import { writeFileSync } from "node:fs";
const c = await connect();
const r = await c.call("model-selection", "getView", {}, 15000);
writeFileSync("/tmp/opencode/zprobe/model-view.json", JSON.stringify(r.values?.[0], null, 2));
console.log("type", r.type, "bytes", JSON.stringify(r.values?.[0]).length);
console.log("top-level keys:", Object.keys(r.values?.[0] ?? {}));
c.close();
process.exit(0);
