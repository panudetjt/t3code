import { connect } from "./channel.mjs";

const c = await connect();

const probe = async (label, channel, method, arg) => {
  const t0 = performance.now();
  const r = await c.call(channel, method, arg, 8000);
  const payload = JSON.stringify(r.values?.[0] ?? { type: r.type });
  return { label, channel, method, type: r.type, ms: Math.round(performance.now() - t0), payload: payload.length > 260 ? payload.slice(0, 260) + "..." : payload };
};

const rows = [];
rows.push(await probe("unknown method", "session", "doesNotExist", {}));
rows.push(await probe("resume with mode param", "session", "resume", { sessionId: "__probe_invalid__", mode: "plan" }));
rows.push(await probe("resume without mode", "session", "resume", { sessionId: "__probe_invalid__" }));
rows.push(await probe("setMode is registered", "session", "setMode", { sessionId: "__probe_invalid__", mode: "plan" }));

for (const row of rows) console.log(JSON.stringify(row));
c.close();
process.exit(0);
