import { connect } from "./channel.mjs";
const c = await connect();
for (const [svc, m, arg] of [
  ["oauth", "getProviders", undefined],
  ["oauth", "getActiveProvider", undefined],
]) {
  const r = await c.call(svc, m, arg, 15000);
  console.log(`${svc}.${m} -> [${r.type}]`, r.type === 201 ? JSON.stringify(r.values?.[0], null, 1).slice(0, 2000) : JSON.stringify(r).slice(0, 300));
}
c.close();
process.exit(0);
