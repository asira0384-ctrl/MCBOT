# Protocol 2193 runtime palette

Derived from GeyserMC/Geyser `core/src/main/resources/bedrock/block_palette.26_50.nbt`, commit 50115039af4cd92e50545075d3a13eea6880cf88. MIT license included. Source SHA-256: 54c9bed0bef30aadc316b21c6e82b5ac407c5c6e351b9d9690aa4e9a49fec912.

22091 ordered network states are mapped to pinned minecraft-data 3.117.0 local states by block name and all local state properties. Extra wire properties are retained by their distinct runtime IDs; the local collision model does not model every new derived property. 2050 states without a matching local definition remain unknown, never air. All previously unknown IDs in the user's v0.2.9 report resolve with this table. Applies only to protocol 2193. Hash IDs are from the source network_id field.
