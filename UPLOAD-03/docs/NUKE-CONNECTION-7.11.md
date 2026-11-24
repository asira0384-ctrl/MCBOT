# Nuke mining compatibility and connection recovery — 7.11

Apply these changed files over the **7.10.1 server source**, preserving the paths in the ZIP. Commit them to the GitHub repository and redeploy Railway with the updated `package.json` **and** `package-lock.json`. The normal build must install the new dependencies (`npm ci`); copying just `src/digging.js` is insufficient. The existing `Asira-Native-7.10.exe` remains compatible. This archive does not deploy anything automatically.

## Mining completion

The supplied 7.10.1 report records Nether obsidian mining at `(24,73,-49)`, face 4. A prediction with an embedded MineBlock durability request precedes the disconnect by about 310 ms. The terrain column was fully supplied; its refresh request was correctly skipped. This narrows the investigation to mining completion, but the report does not record the two server authority flags and does not establish the server implementation or prove which byte was rejected.

Previously every server-authoritative block break sent an embedded MineBlock item-stack request. The completion now follows both negotiated capabilities:

| Block-breaking authority | Inventory authority | Completion |
| --- | --- | --- |
| Legacy/client | Either | Existing legacy break transaction |
| Server | Legacy or unannounced | Block prediction without a MineBlock stack request |
| Server | Server | Block prediction and MineBlock in the same input frame |

An explicit legacy inventory mode also omits the stack request. A server-authoritative inventory must supply a valid positive tool stack identity before mining starts. Completion rereads the current server tool identity and durability, so a slot correction during mining cannot send the old identity. A block is counted only after the server reports it as air.

## Dependencies and versions

The pinned versions are bedrock-protocol **3.61.0**, minecraft-data **3.119.0**, and prismarine-chunk **1.41.0**. Support includes the 1.26.60 wire family, protocol 2225, while retaining 1.26.51/protocol 2193 compatibility. Both network block palettes were regenerated against the new local block-state definitions; the old dependency version label was not simply changed. Their source checksums and rebuild commands are in `vendor/bedrock-palettes/README.md`.

For ordinary servers the default remains discovery of a compatible advertised version. An older server can therefore still select 1.26.51 even though the library is updated. Existing explicit numeric version settings are respected. `MC_VERSION=latest` or `IGN_VERSION=latest` explicitly selects the installed current release, 1.26.60; use this only for a server that accepts it. `auto` enables discovery for either setting. No Railway port or public URL changes are required for this patch.

## Recovery and diagnostics

A kick now closes the bot session even if the transport omits its close notification. Unexpected disconnects continue reconnecting beyond the previous six-attempt limit, with bounded backoff and a small fleet offset. Existing same-world Nuke resume remains in place. Manual Disconnect, Nuke OFF, AutoLog restrictions, and authentication failures retain their existing behavior.

Control → Export Debug now identifies backend build **7.11** and the installed dependency versions. It includes live server authority flags and preserves those flags, the selected completion path, and the mining prediction at disconnect. This helps distinguish server capability handling from a wire-format rejection without including account credentials.

## Validation

`npm test`: **172 passed, 0 failed** on Node 24.22.3. Coverage includes both inventory authority modes, the reported Nether block position/face/durability, a server stack correction during mining, a missing tool identity, reconnect after more than six failures, explicit disconnect, and failed authentication. Local real encrypted RakNet/UDP tests pass on both 1.26.51 and 1.26.60, including discovery, teleport acknowledgement, terrain requests, inventory operations, mining completion, consumables, combat packets, chat, and logout.

The target public server was not authenticated or tested from this environment. These checks demonstrate local compatibility and regression coverage, not a guarantee against every server-side disconnect. After deployment, the exported backend build and dependency fields confirm that Railway is running this patch.
