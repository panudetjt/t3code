import { connect } from "./channel.mjs";
const c = await connect();
const cases = [
  ["model-selection", "getView", {}],
  ["model-selection", "getView", { workspace: {} }],
  ["model-selection", "doesNotExist", {}],
  ["provider-settings", "getSnapshot", {}],
  ["provider-settings", "read", {}],
  ["provider-provisioning-status", "getSnapshot", {}],
  ["provider-provisioning-status", "read", {}],
  ["client-config", "get", {}],
  ["client-config", "getConfig", {}],
  ["client-scenes", "get", {}],
  ["setting", "get", {}],
  ["oauth", "getStatus", {}],
  ["usage-stats", "get", {}],
  ["coding-plan-subscription", "getSnapshot", {}],
];
for (const [svc, m, arg] of cases) {
  const r = await c.call(svc, m, arg, 8000);
  const out = r.type === 201 ? JSON.stringify(r.values?.[0]) : JSON.stringify(r);
  console.log(`${svc}.${m} -> [${r.type}] ${out.slice(0, 400)}`);
}
c.close();
process.exit(0);
