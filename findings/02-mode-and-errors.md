# Runtime modes and JSON-RPC error taxonomy (`app-server --stdio`)

Two CLI versions, same probes: `3.16.3` (CLI `0.17.0`, the branch's declared floor) and `3.17.2` (CLI `0.17.1`). Isolated `ZCODE_DATA_BASE_DIR`, temp workspace; no turns, no model calls.

## `session/create` applies the permission mode

Requested `mode` lands in `settings.permission.mode`, on both versions:

| requested | `settings.permission.mode` |
| --- | --- |
| `guarded` | `guarded` |
| `edit` | `edit` |
| `yolo` | `yolo` |

Trap: `session.mode` in the same reply is **always `"build"`** for all of these, and for `"build"` and `"plan"` requests too. `session.mode` is the interaction mode (build/plan), not the permission mode. Reading it to check a `guarded`/`edit`/`yolo` selection reports `build` and looks like the parameter was ignored. It was not.

## `session/setMode` exists at the floor version

`session/setMode { sessionId, mode: "yolo" }` on a session created with `guarded`; `session/read` then reports `settings.permission.mode: "yolo"`. Same on `3.16.3` and `3.17.2`.

## `session/resume` takes no mode

```
session/resume { sessionId, mode: "guarded" }
-> -32602 Invalid params — (root): Unrecognized key: "mode"

session/resume { sessionId }
-> ok, reply carries settings.permission.mode = "yolo"
```

Both versions. Two consequences:

1. Re-applying the mode after resume (`session/setMode`) is the only way to make a mode that changed while the thread was detached take effect, because resume rejects the parameter.
2. Resume itself preserves the CLI-side permission mode, so the re-apply is a re-assertion, not a repair. The branch calls `setMode` after resume and again before a turn whenever the mode differs from what it last set.

## Error codes

```
session/doesNotExist                     -> -32601 Method not found: session/doesNotExist
session/resume with an unknown key       -> -32602 Invalid params — (root): Unrecognized key: "mode"
session/resume with an unknown session   -> -32004 Session not found: sess_…
```

So a missing method (`-32601`) is distinguishable from a bad parameter (`-32602`) and from missing state (`-32004`) — which is what a version-floor check needs to tell "this CLI is too old" apart from "this call was wrong".

## Sessions do not survive the process

`session/resume` for a session id created by an earlier `app-server --stdio` process returns `-32004 Session not found`, even with the same `ZCODE_DATA_BASE_DIR`. Resume is same-process in this transport; cross-restart continuity on the `serve` branch comes from the daemon's own store instead.
