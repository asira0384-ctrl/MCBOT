Source: https://github.com/torzodmc/mineflayer-for-bedrock
Commit: 1f41d63a35072ba266dc1b6c34034c69b187dff0
Upstream package.json declares MIT. Only physics, controls, pathfinder and utility modules are included. Changes: fail closed for hazards; maximum drop 1; movement deadline handled by application; input packets adapted by native adapter.
Additional changes: correct radians/degrees at protocol boundary, correct movement direction, freeze unknown terrain, send look on physics ticks. Native protocol/chunk/inventory code lives in src and is independent of the upstream world/inventory plugins.
