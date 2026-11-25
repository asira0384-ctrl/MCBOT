# Nuke recovery and MobAura — 7.9

## Installation

Apply this changed-files archive over the latest 7.8 source, including the packet/scaffold fixes, preserving the relative paths. Redeploy the Railway service and run Asira-Native-7.9.exe. Existing data and Microsoft authentication caches must be kept. This patch adds no npm dependencies. It does not update GitHub or Railway automatically.

Turn Nuke ON once after updating to record the mining intent for the current server and world. An unexpected disconnect preserves that intent. Once the reconnect policy reconnects the bot, mining resumes after terrain and health have loaded, provided the host, port, dimension and available world identifier match. Pending server forms still require a human response. Nuke OFF, Stop, Disconnect, and scaffold-cleanup commands cancel the mining intent; AutoLog still prevents automatic reconnection. Continuous short connections retain the reconnect backoff count, with the existing six-attempt limit. Explicit Connect allows another attempt.

## Mining changes

- Range is the maximum Euclidean distance from the bot's eyes to the nearest point of the target block's collision bounds. Range 5 permits digging within five blocks; farther targets require walking closer. Stance selection and the actual dig use the same distance rule. The server can enforce its own reach limit.
- Finish the nearest unfinished assigned chunk from top to bottom before moving on. Distant unloaded chunks no longer hold up a local chunk. Existing fleet work sharing remains active.
- Request the current height section and at most one section below it instead of the whole cuboid height. Later terrain sections invalidate cached data without resetting the current layer upward.
- Terrain decode errors retain a diagnostic without permanently stopping the miner. Unknown terrain remains unknown and must be received before mining it.
- Movement follows the advertised movement authority. Normal automatic mode sends one movement packet family rather than both. Dual sending remains available only through the explicit compatibility command. A blocked walk retries its route instead of automatically enabling duplicate packets.

## Combat / MobAura

MobAura is independent of player/crystal combat and can run while Nuke stays ON.

| Setting | Behavior |
| --- | --- |
| Range | Attack mobs within this distance; never chase mobs outside it. Default: 4. |
| Attack Delay | Minimum interval in milliseconds. Default: 500. Actions also depend on the worker tick and equipment confirmation. |
| Weapon | Auto selects an available sword or axe. Sword and Axe restrict selection to that weapon type. Pickaxes are excluded. |
| Targets | Hostile attacks registry-classified hostile mobs. All Mobs includes supported animals and other living mobs. |

Players, crystals, projectiles, dropped items, armor stands and vehicles are excluded. Unknown/custom entity types without a supported living-mob classification are skipped. Line of sight is required. MobAura does not supply weapons.

Food and manual inventory operations retain priority. A ready mob attack may interrupt the current mining hand action, then mining continues. Missing weapons and attack cooldowns do not interrupt mining. No additional polling timer is added; MobAura uses the existing worker tick. Module and setting descriptions are available in Japanese on hover.

## Files and ownership

- `src/mining-lifecycle.js`: persisted Nuke intent and same-world recovery.
- `src/mining-reach.js`: mining reach geometry.
- `src/movement-wire.js`: outgoing movement packet selection and validation.
- `src/model/combat/mobaura.js`: target selection, weapon selection and hand arbitration.
- `src/mining.js`: chunk/layer work and terrain requests.
- `src/worker.js`, `src/manager.js`, `src/connection-keeper.js`: worker and connection lifecycle integration.
- `src/desktop-modules.js`: Combat module catalog, settings and enable state.
- `desktop-native/descriptions-ja.h`: Japanese module/setting help.

## Validation and limits

Backend regressions cover disconnect recovery, pending forms/world mismatch, deferred starts, reconnect backoff, Range 5 movement versus digging, section requests and progress retention, outgoing packet selection, MobAura exclusions, sword/axe selection, Nuke coexistence, missing weapons and cooldowns. The complete suite also includes the existing local UDP connection test and bounded multi-miner performance checks. The Windows x64 EXE was cross-compiled successfully.

The affected public Minecraft server and a Windows runtime were not available for live reproduction. A `Corrupted packet` message alone does not identify the offending packet. These changes remove concrete duplicate movement and recovery problems; they do not establish that every server kick or live-server lag is eliminated. Existing last-exit packet metadata remains available for further diagnosis, without recording credentials or authentication tokens.
