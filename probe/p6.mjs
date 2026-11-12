import { connect } from "./channel.mjs";
const c = await connect();
for (const [svc, m, arg] of [
  ["usage-stats", "getEntitlementSnapshot", undefined],
  ["usage-stats", "getCodingPlanUsageSnapshot", undefined],
  ["usage-stats", "getSnapshot", undefined],
  ["client-config", "getSnapshot", undefined],
]) {
  const t0 = Date.now();
  const r = await c.call(svc, m, arg, 25000);
  const body = r.type === 201 ? JSON.stringify(r.values?.[0]) : JSON.stringify(r).slice(0, 200);
  console.log(`\n### ${svc}.${m} [${r.type}] ${Date.now()-t0}ms len=${body.length}`);
  console.log(body.slice(0, 1200));
}
c.close();
process.exit(0);
