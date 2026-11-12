# `ZCODE_BASE_URL` is an origin, and the catalog hash agrees

Two facts, both checked against `3.17.2`.

## 1. The vendor reduces the endpoint to an origin

Shipped source: `runtime/node_modules/@zcode/shared/src/zcodeEndpoint.ts` inside the `3.17.2` release.

```ts
export function normalizeZCodeEndpointOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("ZCode endpoint origin is empty");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("ZCode endpoint origin must use http or https");
  return parsed.origin;
}
```

```ts
export function buildZCodeEndpointUrls(origin: string, options = {}): ZCodeEndpointUrls {
  const normalizedOrigin = normalizeZCodeEndpointOrigin(origin);
  const parsed = new URL(normalizedOrigin);
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const wsOrigin = `${wsProtocol}//${parsed.host}`;
  return {
    origin: normalizedOrigin,
    apiBaseUrl: `${normalizedOrigin}/api/v1`,
    relayWsUrl: `${wsOrigin}/api/v1/remote/ws2`,
    zcodePlanOpenAiBaseUrl: `${normalizedOrigin}/api/v1/zcode-plan`,
    zcodePlanAnthropicBaseUrl: `${normalizedOrigin}/api/v1/zcode-plan/anthropic`,
    …
  };
}
```

So any path on the override is discarded before use: `https://example.test:8443/ignored/path` becomes `https://example.test:8443`, and the API base is rebuilt as `<origin>/api/v1`.

Precedence, from `resolveRuntimeZCodeEndpointOrigin` → `resolveZCodeEndpointOrigin`:

- `ZCODE_ENV` is `"test"` only when explicitly set to `test`; otherwise `production`.
- In `production`, `ZCODE_BASE_URL` (or `ZCODE_ENDPOINT_ORIGIN`, or `ZCODE_PRODUCTION_BASE_URL`) is normalized and used; a profile-level override is ignored.
- In `test`, the profile override wins, then `ZCODE_BASE_URL` / `ZCODE_ENDPOINT_ORIGIN` / `ZCODE_TEST_BASE_URL`.
- With nothing set, production is `https://zcode.z.ai` and test is `https://zcode.chatglm.site`.

A runtime probe confirms `doctor` makes no request to a bogus override, so the normalization above is the only place the value is interpreted; `probe/ep.mjs` is the script (local listener, zero hits, exit 0).

## 2. The provider catalog directory is keyed on that same origin

The CLI keeps the built-in provider catalog under:

```
~/.zcode/v2/runtime/provider/linux-x86_64/3.17.2/endpoint-78d7c3bef4024722642626fe3669a799/
```

`sha256("https://zcode.z.ai")` = `78d7c3bef4024722642626fe3669a7995df81a7686ae62e0c31d41a14e61faca`. The directory suffix is the first 32 hex characters of that digest — i.e. the production origin, not a URL with a path.

```js
const c = require("crypto");
c.createHash("sha256").update("https://zcode.z.ai").digest("hex");
// 78d7c3bef4024722642626fe3669a7995df81a7686ae62e0c31d41a14e61faca
```

## Why it matters for a T3 adapter

If a host builds its environment from the raw override and the catalog path from a differently normalized value, the two disagree and the CLI reports no models for a perfectly valid login. That is the failure the branch fixed: normalize once to an origin, use it for both the CLI environment and the catalog directory lookup.
