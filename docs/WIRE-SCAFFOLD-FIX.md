# 7.8 server patch: scaffold preference and packet safety

## Scaffold

A successfully reached natural-ground route now takes precedence even when its cost exceeds the old detour threshold. The mining stance selector no longer rejects that ground route in favour of a scaffold shortcut. When the selected stance plan uses zero placements, the subsequent walk explicitly disables scaffold, so replanning cannot silently change that decision. If no existing-ground route is found within the planner's search bounds, scaffold remains available when enabled and stocked. A route outside the bounded search area is not guaranteed to be discovered.

## Corrupted packet

The screenshot reports a server/network Corrupted packet disconnect; it does not identify which outbound packet or schema caused it. This patch therefore does not claim that the exact live-server cause has been reproduced.

Before adapting or draining pending mining actions, reject movement frames with NaN, Infinity, nonnumeric or out-of-float-range vector/angle values. Halt movement and emit a diagnostic rather than serializing that frame. Align conditional PlayerAuthInput presence flags with actual transaction, stack request, block action and vehicle payloads. Remove empty block actions and partial vehicle fields.

Retain a bounded ring of the last 24 gameplay packet metadata records, not full packets or credentials. A Corrupted packet exit records the last packet name and negotiated protocol version in the existing last-exit display. The data record also retains the metadata ring for developer diagnosis. No login bodies, account passwords, OAuth tokens or chat message contents are captured by this ring.

116 tests passed, including serialization round trips for Bedrock 1.21.2 and 1.26.51 and a local Native RakNet real UDP handshake/gameplay test. Seven relevant tests were rerun after the final empty-field cleanup and passed. No test against the actual target server was performed.

## Install

Apply these changed files over the 7.8 server source and redeploy Railway. Keep Asira-Native-7.8.exe; an EXE rebuild is unnecessary. Keep all existing account data and authentication caches. Direct GitHub writes have not been made.

If the target server still reports Corrupted packet, the last-exit metadata and the negotiated protocol are required to identify the remaining server-specific mismatch. The patch does not change AutoLog conditions or bypass server protections.
