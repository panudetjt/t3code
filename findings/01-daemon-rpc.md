# `zcode serve`: what the daemon exposes instead of the credential store

Measured against `3.17.2` (CLI `0.17.1`).

## Transport

- `ws://<host>:<port>/ws/host?token=<ingress-token>`, plus `x-zcode-rpc-host-capability`.
- Capability comes from `POST /api/rpc-host-capability` (Bearer ingress token); `GET /api/server-info` describes the daemon.
- Frames: `1 byte kind + u32 id + u32 ack + u32 len`, body tagged/varint (tags: 0 undefined, 1 string, 2 buffer, 4 array, 5 object, 6 int).
- A call's header is `[100, id, channel, method]` with a one-element arg list. Replies: 200 initialized, 201 result, 202 error, 203 rejected, 204 event.
- Dispatch is `handler[cmd].apply(handler, args)` on the service object, so the callable surface is exactly that object's methods. There is no introspection call; `ServiceChannels` in the shipped bundle is the only map of names.

## Three read-only calls replace the credential store

Live daemon, developer's account:

| call | result |
| --- | --- |
| `oauth.getActiveProvider` | `"zai"` (2-3 ms) |
| `model-selection.getView` | one provider `account:zai-individual-coding-plan`, models `GLM-5.3` and `GLM-5.3-Flash`, `reasoningLevel: [low, high, max]`, `contextWindow: 1000000` (1-2 ms, 1958 B) |
| `provider-settings.getView` | six account providers with `accountState { availability, entitled, current, unavailableReason }` plus `executable` (1-3 ms, 44 KB) |

Full payloads: `../samples/live-model-selection.json`, `../samples/live-provider-settings.json`.

`model-selection.getView` matches the branch's file-based enumeration model for model, including reasoning levels, so `provider/updateAccountConfig` is not needed and the picker no longer needs `setting.json`, `current.json`, or the catalog files.

## Negative control: isolated daemon, no `credentials.json`

Seeded with the runtime catalog, `setting.json`, and `provider_config.json` only; started with `serve --supervisor --server-root <temp>`. Captured in `../samples/negative-control.json`:

```
oauth.getActiveProvider    -> null
model-selection.getView    -> { providers: [], effectiveSelection: null, selectionIssue: "selection-missing" }
provider-settings.getView  -> 6 providers, executable false,
                              availability "unavailable", entitled false,
                              unavailableReason "not-connected"
usage-stats.getEntitlementSnapshot -> { authenticated: true, unavailableReason: "not_configured" }
```

Stopped with `server-cli.js stop --server-root <temp>`; the port was released.

## Traps

1. `usage-stats.getEntitlementSnapshot().authenticated` is `true` even with no credentials (the last line above). It is not a login signal; use `oauth.getActiveProvider !== null`.
2. Logged out surfaces as `unavailableReason: "not-connected"`, not `"not-authenticated"`. `accountState` alone cannot separate "logged out" from "logged in, plan not connected", so pair it with `oauth.getActiveProvider`.
3. `availability: "unknown"` means the account probe is still running, and models are non-executable in that state. An offline probe yields an empty picker, where catalog enumeration would still list models. The badge has to tell "no models" apart from "not probed yet".
4. `selectionIssue: "selection-missing"` is what an empty picker looks like when no provider is current; it is not an error reply (type 201, not 202).

## Cost

Warm calls: 1-3 ms. The `zcode doctor --json` probe `status.ts` runs today: ~1.0 s (1.05 / 1.00 / 1.03 over three runs). `provider-settings.onDidChange` and `model-selection.onDidChange` are subscribable, so the badge and picker can refresh without polling.

## Effect on the branch

Everything the residual credential read fed is available over the channel: `readZcodeAuthStatus` → `oauth.getActiveProvider` plus `provider-settings.getView`; `zcodeEntitledModels` → `model-selection.getView`; `zcodeEntitlements.ts` (229 lines, including `decryptZcodeCredential`) is deleted outright.

The client still reads `run/status.json` and `run/ingress-token` — daemon-issued local control files, not the Z.AI credential. It no longer needs `.zcode/v2/credentials.json`, `.zcode/v2/setting.json`, `current.json`, or the catalog files for the picker.
