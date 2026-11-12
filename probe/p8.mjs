import { connect } from "./channel.mjs";
const c = await connect();
const timed = async (svc, m) => {
  const t0 = performance.now();
  const r = await c.call(svc, m, undefined, 30000);
  return { svc, m, type: r.type, ms: Math.round(performance.now() - t0), bytes: JSON.stringify(r.values?.[0] ?? r).length };
};
for (let i = 0; i < 3; i++) {
  for (const [svc, m] of [["oauth", "getActiveProvider"], ["model-selection", "getView"], ["provider-settings", "getView"]]) {
    console.log(JSON.stringify(await timed(svc, m)));
  }
}
const q = c.listen("provider-settings", "onDidChange", []);
await new Promise((r) => setTimeout(r, 1500));
console.log("listen provider-settings.onDidChange ok, events:", q.length);
const q2 = c.listen("model-selection", "onDidChange", []);
await new Promise((r) => setTimeout(r, 1000));
console.log("listen model-selection.onDidChange ok, events:", q2.length);
c.close();
process.exit(0);
