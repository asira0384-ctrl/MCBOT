# Nuke 7.8: bounded mining work and group statistics

## Changes

- Terrain scanning: maximum 2048 cells per scan, with a cooperative 3ms cutoff checked between layers. One layer operation and peer lookups can exceed this time target; this is not a hard real-time guarantee.
- Cache at most 64 chunk-layer results per miner for up to 500ms; invalidate the affected chunk when block or terrain packets arrive.
- Look at at most 12 nearby candidates for expensive reach/visibility checks, rather than every candidate in a full layer.
- Precompute same-job peers once per preparation, not for every unknown cell.
- Preserve scanned layer progress when a fleet member joins, pauses or disconnects. Reassign chunk ownership separately.
- Work on the nearest eight unfinished chunks, preferring assigned chunks and retaining the current nearby chunk. Descend top-down within this local work window; far unloaded chunks no longer hold the whole cuboid at one global height.
- Yield between each mining-stance path search. Reduce repeated inventory discard and scaffold-cleanup work to once per second during ordinary digging. Final scaffold cleanup still runs normally.
- Resume tool waiting when a valid pickaxe is already present, even if there was no new inventory event. Report unexpected stopping errors in mining status.
- Expose scan reads/time/cache size and runtime loop timing in the desktop state API for diagnosis.

## Statistics

All Bots, IGN and 2b2e selections show aggregate lifetime confirmed blocks, session confirmed blocks and connection/activity counts. Offline selected accounts contribute their saved counts; a block is counted by the worker only after the existing dig confirmation path succeeds. Group views no longer render one long status card per bot.

Selecting one bot shows its individual status and last recorded exit. AutoLog exits retain the AutoLog reason; other exits retain the available server/network error, or explicitly say that no reason packet was received. AutoLog safety conditions and reconnect policy were not disabled. A recorded server/network category is not a diagnosis of the exact network cause.

## Validation

108 backend tests including six simulated miners over a 1024-chunk region, progress retention across fleet changes, cache invalidation, bounded visibility checks, supply-wait resumption, offline totals, and nearby mining despite far unloaded terrain.

The legacy scan allowed 8192 cells per bot (49152 for six), before other checks. New tests cap direct layer scanning at 2048 per bot, and the wall-time cutoff can reduce that further. This measures local algorithm work, not live-server TPS, packet loss, Railway CPU allocation or real Windows movement smoothness.

Windows x64 EXE cross-compiled. No live Minecraft server or Windows runtime test was performed.

## Install

Apply the changed source files over the 7.7 installation and redeploy Railway, then run Asira-Native-7.8.exe. Keep the existing data directory and Microsoft caches. Direct GitHub changes were not made.
