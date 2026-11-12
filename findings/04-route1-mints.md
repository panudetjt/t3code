# What being the CLI's host cost (route 1)

Context, not a recommendation: the closed app-server branch (`zcode-ref-33684`) played the CLI's host, so it had to answer the agent's credential requests itself.

## The obligation

`app-server --stdio` splits the CLI into a host and an agent; before every account-model request the agent asks its host for provider credentials. The branch therefore had to:

1. read and decrypt the CLI's credential store (`.zcode/v2/credentials.json`),
2. call Z.AI's project-token endpoint to mint a short-lived token,
3. cache it per provider family, keyed on the account scope so a CLI-side login swap invalidates the hit,
4. re-mint when the CLI rejects a token fingerprint.

Steps 1-2 are what no other provider in this repo does. Kiro passes `--auth-method=cli`, Claude and Antigravity use ACP/SDK `authenticate`, Codex owns `account/login/start`, and OpenCode is reached through `opencode serve` — in all of them the vendor binary performs the exchange.

## The duplicate exchange

Two concurrent cold answers for the same family each minted: the CLI asked twice, the cache was still empty both times, and the endpoint saw two exchanges per cold turn.

`patches/inflight-dedupe.patch` (68 lines) fixes it with one in-flight `Deferred` per `family:accountScope`; the second answer waits on the first instead of minting again, and the entry is removed when the exchange settles. Measured at the time: two exchanges before, one after, with the package's existing tests green.

Provenance: this was measured while developing that branch and was not re-run for this document, because reproducing it needs a real provider turn. The patch itself is here so the logic can be reviewed without the branch.

## Why it belongs in the evidence pack

It is the concrete cost of route 1: the host becomes responsible for cache invalidation, concurrent de-duplication, and a vendor endpoint chain that the CLI already implements for its own daemon. On `zcode serve` none of this code exists — the daemon performs the exchange and T3 reads `oauth.getActiveProvider` instead (see `01-daemon-rpc.md`).
