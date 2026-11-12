import { connect } from "./channel.mjs";
import { readFileSync } from "node:fs";

const [serverRoot] = process.argv.slice(2);
const c = await connect(serverRoot);
const out = {};
const timed = async (svc, m, arg) => {
  const t0 = performance.now();
  const r = await c.call(svc, m, arg, 20000);
  return { type: r.type, ms: Math.round(performance.now() - t0), value: r.values?.[0] ?? null };
};
out.oauthGetActiveProvider = await timed("oauth", "getActiveProvider");
out.modelSelectionGetView = await timed("model-selection", "getView");
const settings = await timed("provider-settings", "getView");
const providers = Array.isArray(settings.value?.providers) ? settings.value.providers : [];
out.providerSettingsGetView = {
  type: settings.type,
  ms: settings.ms,
  bytes: JSON.stringify(settings.value ?? null).length,
  providers: providers.map((p) => ({
    providerId: p.providerId,
    executable: p.executable,
    accountState: p.accountState,
  })),
};
out.usageStatsEntitlementSnapshot = await timed("usage-stats", "getEntitlementSnapshot");
console.log(JSON.stringify(out, null, 2));
c.close();
process.exit(0);
