import { connect } from "./channel.mjs";
const root = process.argv[2];
const c = await connect(root);
console.log("server:", JSON.stringify(c.info).slice(0, 200));
for (const [svc, m] of [
  ["oauth", "getActiveProvider"],
  ["provider-settings", "getView"],
  ["model-selection", "getView"],
  ["usage-stats", "getEntitlementSnapshot"],
]) {
  const r = await c.call(svc, m, undefined, 25000);
  if (r.type !== 201) { console.log(`### ${svc}.${m} [${r.type}]`, JSON.stringify(r.values?.[0]).slice(0, 300)); continue; }
  const v = r.values?.[0];
  if (svc === "provider-settings") {
    console.log(`### ${svc}.${m} [201] providers=${v.providers?.length}`);
    for (const p of v.providers ?? []) console.log("   ", p.providerId.padEnd(42), JSON.stringify(p.accountState), "exec=" + p.executable);
  } else if (svc === "model-selection") {
    console.log(`### ${svc}.${m} [201] providers=`, JSON.stringify((v.providers ?? []).map(p => ({ id: p.providerId, models: p.models.map(x => x.modelId), access: p.config?.access }))));
  } else {
    console.log(`### ${svc}.${m} [201]`, JSON.stringify(v).slice(0, 400));
  }
}
c.close();
process.exit(0);
