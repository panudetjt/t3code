# ZCode provider — evidence pack

Reference material for [pingdotgg/t3code#33685](https://github.com/pingdotgg/t3code/discussions/33685). Two implementation attempts were closed unmerged; this branch keeps the measurements behind the claims, not the code.

Nothing here is a proposal. It exists so the numbers in the discussion can be checked.

## Environment

| | |
| --- | --- |
| OS | Linux x64 |
| ZCode server releases present | `3.16.3` (CLI `0.17.0`, the branch's `MINIMUM_ZCODE_VERSION`), `3.17.1`, `3.17.2` (CLI `0.17.1`) |
| Live daemon used for positive measurements | `3.17.2`, the developer's own account |
| Isolated daemon used for the negative control | `3.17.2`, temp `--server-root`, `HOME` pointed at a temp tree with **no** `credentials.json` |

## What each claim rests on

| claim | file | how |
| --- | --- | --- |
| The daemon exposes login, entitlement, and the model list without the credential store | [findings/01-daemon-rpc.md](findings/01-daemon-rpc.md) | Three read-only channel calls against the live daemon, plus an isolated daemon with no credentials |
| `session/resume` accepts no mode; `setMode` exists at the floor version | [findings/02-mode-and-errors.md](findings/02-mode-and-errors.md) | JSON-RPC against `app-server --stdio` on both `3.16.3` and `3.17.2` |
| `ZCODE_BASE_URL` / `ZCODE_ENDPOINT_ORIGIN` are reduced to an origin | [findings/03-endpoint-origin.md](findings/03-endpoint-origin.md) | The vendor's own shipped module, `@zcode/shared/src/zcodeEndpoint.ts` |
| Being the CLI's host doubled credential exchanges until deduped | [findings/04-route1-mints.md](findings/04-route1-mints.md) | Measured while developing the app-server branch; the small patch is in `patches/` |

## Samples

- `samples/live-model-selection.json` — `model-selection.getView` on the live daemon (1.9 KB).
- `samples/live-provider-settings.json` — `provider-settings.getView` on the live daemon (44 KB). `connectionKey` values are redacted; they hash the account session.
- `samples/negative-control.json` — the same three calls against a daemon with no `credentials.json`.

## Reproducing

The probe scripts need a running `zcode serve`; they read `run/status.json` and `run/ingress-token` from a `--server-root`, and they only ever read.

```
node probe/capture.mjs <server-root>          # the three read-only calls + the usage-stats trap
node probe/p9.mjs                             # channel-level error taxonomy
node probe/p10.mjs <release-dir> create yolo  # mode applied at create/setMode
node probe/p13.mjs <release-dir>              # resume carries no mode, preserves permission mode
```

`probe/channel.mjs` is a from-scratch client for the daemon's binary channel protocol: a 13-byte frame header plus tagged/varint bodies, capability handshake over `POST /api/rpc-host-capability`.

No script here sends a prompt or starts a turn, so none of them spend quota.

## Captures

The UI captures from both branches stay on the fork's release tag [`pr-evidence`](https://github.com/panudetjt/t3code/releases/tag/pr-evidence) rather than in this repository — ten PNGs and one MP4, about 6 MB. They are linked from Appendix D of the discussion.

| capture | shows |
| --- | --- |
| `01-settings-providers-zcode.png` | route 1 provider page, "Authenticated · zcode", v0.17.1 |
| `02-model-picker-zcode.png` | route 1 picker with the plan's GLM models |
| `03-chat-glm-reply.png` | a GLM-5.3-Flash turn answering |
| `zcode-serve-provider.png` | route 2 provider page, launch arguments now target `zcode serve` |
| `zcode-serve-config.png` | add-provider wizard, Config step |
| `zcode-serve-models.png` | picker fed by `model-selection.getView` |
| `zcode-serve-turn.png` | streaming turn over the daemon channel |
| `zcode-serve-interaction.png` | AskUserQuestion answered through `resolveInteraction` |
| `zcode-serve-interrupt.png` | interrupt mid-turn |
| `zcode-serve-resume.png` | resume after restart; the "Reasoning level is required" error is the pre-fix state |
| `zcode-serve-walkthrough.mp4` | end-to-end walkthrough |

Download base: `https://github.com/panudetjt/t3code/releases/download/pr-evidence/<name>`
