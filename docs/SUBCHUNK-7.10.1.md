# Terrain requests and mining request IDs — 7.10.1

Apply this changed-files patch over the 7.10 server source and redeploy Railway. Keep the existing Asira-Native-7.10.exe and all account/configuration data. No EXE replacement or npm dependency changes are needed.

## Evidence and correction

The supplied 7.10 debug export records a prediction at tick 226 and a server `Corrupted packet` disconnect about 307 ms later. Its saved last packet is a later idle PlayerAuthInput. The accompanying screenshot shows a different attempt ending after a SubChunkRequest. The available export records packet names and actions, not the original payloads; neither last-packet label alone proves which operation caused the rejection.

Two defects were reproduced locally:

- The 1.26.51 subchunk-request schema uses `x`, `y`, `z` for offsets, while the application supplied the older `dx`, `dy`, `dz` shape. The serializer silently wrote all three offsets as zero. Requested sections 4 and 5 became two duplicate requests for section 0. A version-aware normalizer now preserves the intended offsets, validates signed-byte ranges and deduplicates entries. Older protocol schemas retain the older field names.
- Mining allocated a stack-request ID with pre-decrement, while inventory operations used post-decrement. A subsequent inventory operation could reuse the preceding mining ID. Both now use the same post-decrement sequence.

## Terrain request eligibility

The server must announce a column as client-request terrain before the bot requests its subchunks. Full-column and unannounced terrain no longer produce unsolicited requests, including the former forced refresh after an unconfirmed dig. Received sections are updated through normal block updates rather than repeatedly requested.

Dimension limits and the server's highest non-air section are respected. Sections explicitly identified as air are marked known, so the miner does not wait on impossible requests. Responses from another dimension or an unannounced column are ignored. An unconfirmed dig retains the existing bounded retry path rather than treating the locally predicted block as confirmed air.

Implementation: `src/subchunk-request.js` normalizes and validates the outgoing shape. `src/world.js` tracks request-enabled columns, known air, and received sections. `src/bedrock.js` normalizes at the outgoing queue boundary as well.

## Diagnostic continuity

The next Export Debug report identifies build 7.10.1. It preserves the last terrain request, mining prediction and inventory request independently of the short general packet ring. The report records section offsets, mining positions, numeric stack-request fields, and the dig/terrain state captured before stop cleanup. Those details survive a later reconnect and are included in the saved last exit.

Reports retain the existing operational-data allowlist and credential redaction. No raw network buffers, passwords or authentication caches are added.

## Validation

Tests check distinct section heights on both 1.21.2 and 1.26.51, a fixed expected 1.26.51 byte sequence, request-mode eligibility, known-air limits, dimension checks, ID uniqueness across an actual dig followed by an inventory transaction, and frozen diagnostic state after reconnection. A full authoritative mining input is independently parsed to the end of its buffer, including prediction and durability request. The real encrypted local UDP test checks that the receiving server observes the requested nonzero section heights.

These regressions reproduce and remove specific defects. The affected public server was not available for live verification, so elimination of every `Corrupted packet` disconnect is not established.

References:

- https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sub-chunk-request-packet/
- https://github.com/Mojang/bedrock-protocol-docs/blob/main/additional_docs/SubChunk%20Request%20System%20v1.18.10.md
- https://github.com/Sandertv/gophertunnel/blob/7a556a07335b663744b50d38062636ad8283f314/minecraft/protocol/packet/sub_chunk_request.go
