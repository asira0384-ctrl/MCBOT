# Bedrock network block palettes

Derived from the following pinned GeyserMC/Geyser resources. The MIT license is included in `LICENSE-Geyser`.

| Protocol | Supported versions | Source under `core/src/main/resources/bedrock/` | Source commit | Network states |
| --- | --- | --- | --- | ---: |
| 2193 | 1.26.50, 1.26.51 | `block_palette.26_50.nbt` | `50115039af4cd92e50545075d3a13eea6880cf88` | 22091 |
| 2225 | 1.26.60 | `block_palette.26_60.nbt` | `d2cf20058c6c875f7036deb6f6c59e0c39775199` | 23960 |

Source SHA-256 checksums:

- 2193: `54c9bed0bef30aadc316b21c6e82b5ac407c5c6e351b9d9690aa4e9a49fec912`
- 2225: `9d0feee0cd2edc1499bd7f7922615caee4dd268b598fca45dc396f4d0bdcdaa3`

Each ordered network state is mapped by block name and all local state properties to **minecraft-data 3.119.0**. Both tables map every source state. Hash IDs come from the source `network_id` field. Missing runtime IDs remain unknown, never air. The dependency version check prevents stale tables from silently interpreting a new local block-state ordering.

After obtaining the exact source NBT, rebuild from the repository root:

```sh
node scripts/build-network-palette.js /path/to/block_palette.26_50.nbt 2193
node scripts/build-network-palette.js /path/to/block_palette.26_60.nbt 2225
```

The builder verifies the source checksums before replacing either table. A minecraft-data upgrade requires regenerating both files and running the palette, terrain, mining and transport tests; changing the version label alone is unsafe.
