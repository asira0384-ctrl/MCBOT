# Nuke packet fixes, lower-floor routes and Control diagnostics — 7.10

Apply the changed source files over 7.9 while keeping their relative paths, redeploy Railway, then replace the Windows client with Asira-Native-7.10.exe. Keep existing data, authentication caches and settings. No dependency changes are required. This archive does not deploy or change GitHub automatically.

## Invalid mining requests

- `get_updated_block` was being appended to the PlayerAuthInput block-action list after an unconfirmed legacy break. It is not one of the permitted six block actions. Refresh terrain through the existing subchunk request instead. The input adapter also filters out unrelated actions before serialization and caps the list at 100 entries.
- A modern MineBlock stack request uses variant index **9** but nested legacy action byte **11**. The old request constructor overwrote the supplied action byte with zero. Encode the matching legacy byte, including the other action variants used by the constructor.
- Select mining behavior from the server's block-breaking authority independently of its inventory authority. On an input-based movement connection, block actions travel through PlayerAuthInput rather than also being duplicated as standalone PlayerAction packets.
- Legacy mining no longer sends the authoritative prediction action. Authoritative mining still sends prediction and its durability request in the same input frame. Completion emits the default StopDestroyBlock fields, and a pending stop is preserved if confirmation arrives before the next input tick.
- Teleport, initial-terrain and gliding notifications use input flags on input-based connections. Legacy connections retain standalone actions. Dimension-change acknowledgment and respawn retain their standalone protocol messages.

The versioned Mojang JSON schema restricts PlayerAuthInput block actions to StartDestroyBlock, AbortDestroyBlock, StopDestroyBlock, CrackBlock, PredictDestroyBlock and ContinueDestroyBlock. The action-byte regression checks also follow Gophertunnel's 1.26.50 support commit `7a556a07335b663744b50d38062636ad8283f314`, including its variant-to-legacy action mapping. Do not derive numeric PlayerAction values from the ordinal position of an enum name in the older Mojang JSON export: that export omits explicit numeric enum metadata.

Sources:

- https://github.com/Mojang/bedrock-protocol-docs/blob/v1.26.51/json/PlayerAuthInputPacketPayload.json
- https://github.com/Sandertv/gophertunnel/blob/7a556a07335b663744b50d38062636ad8283f314/minecraft/protocol/item_stack.go
- https://mojang.github.io/bedrock-protocol-docs/guides/block-breaking-overview/

## Descending instead of bridging

Mining stance selection previously rejected every stance below the lower of the bot's current Y and the target block's Y. The approach path used the same height restriction. A lower natural floor could therefore be reachable and within mining range but never considered; floating bridge stances were tried instead.

Consider natural stances below the target, bounded by actual eye-to-block reach and the world floor. Ground paths can descend to them while retaining Max Drop, collision, terrain and hazard checks. Existing natural ground remains the first choice. Cached approaches that require placement are reconsidered so that a newly available lower floor can replace a bridge plan. Mining bounds and which blocks can be broken remain enforced independently of walking height.

## Accurate disconnect evidence

On a kick, capture the existing outgoing operational metadata before calling stop/cancel. Ignore subsequent queued gameplay packets after the connection is closing. Stop cleanup used to overwrite the last-packet record with its own abort action, so a displayed `player_action` did not necessarily identify the packet that caused the server to disconnect.

The last-exit label now includes the action or block-action names. Records contain metadata only, not raw packet buffers or authentication data. This is a record of the last queued gameplay operations, not proof of the exact packet rejected by the server.

## Control / Export Debug

The ClickGUI panel is renamed from Console to **Control**. Its saved position migrates automatically. **Export Debug** opens a Save dialog and downloads a JSON report in the background. Select one account for that account's report, or All Bots for a combined report including offline accounts.

The report includes connection state, preserved last-exit metadata, protocol/movement mode, mining bounds, range, progress, failures and confirmed totals. It uses an operational-data allowlist; it does not include account authentication caches, passwords, raw packet bytes or chat history. Sensitive credential fields are excluded, and recognizable credentials and email addresses in error strings are redacted. This is a support report, not an account backup.

## Verification

Regression tests exercise actual dig start/prediction/completion and retry flows through the real packet adapter, plus independent byte checks for the MineBlock action tags and teleport/terrain flags. The local encrypted UDP handshake test now checks the modern teleport acknowledgment through PlayerAuthInput. Lower-floor fixtures check a descent without any placed block, replacement of a cached bridge plan, and refusal of excessive drops, lava and unknown terrain. Debug export tests cover selection, offline accounts and credential exclusions.

The complete backend test suite and the Windows x64 cross-build must pass before delivery. The affected public Minecraft server and the Windows Save dialog have not been tested live. These changes fix reproducible request and route defects; they do not establish that all future server kicks are eliminated.
