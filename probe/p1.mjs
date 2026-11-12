import { connect, TYPE } from "./channel.mjs";
const c = await connect();
console.log("server:", JSON.stringify(c.info).slice(0, 300));
console.log("grant keys:", Object.keys(c.grant ?? {}));
const r = await c.call("project", "readProjects", { includeDeleted: false });
console.log("project.readProjects ->", JSON.stringify(r).slice(0, 600));
c.close();
process.exit(0);
