# FTD Security Specification (Phase 0)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every path not explicitly listed in `firestore.rules` denies all reads and writes.
2. **Admin Exclusivity**: Only verified Google Sign-In admins (`request.auth.token.email_verified == true` matching the bootstrapped owner email or an existing `/admins/{uid}` document) can create, update, or delete site settings, news, competitions, upcoming events, teams, Ballon d'Or state/history, match events, roster users (`managedUsers`), or chat moderation.
3. **Public Fan Vote Integrity**: Unauthenticated or authenticated spectators may ONLY update `/nominees/{nomineeId}` to increment `votes` by exactly `+1` when `/platform/ballonDor.data.votingEnabled == true`, and may never alter player names, ratings, trophies, `rankOrder`, or `isWinner`.
4. **Live Chat Integrity**: Spectators may create `/chatMessages/{messageId}` ONLY when `/platform/site.data.chatEnabled == true`, strictly enforcing `isAdmin == false` unless `isAdmin()` is true. Spectators can never edit or delete chat messages.
5. **Roster & Admin Isolation**: `/managedUsers` and `/admins` are never publicly readable or writable.

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated write to `/platform/site` updating `heroTitle`.
2. Signed-in non-admin user (`email_verified: false` or unrelated email) updating `/platform/liveMatch` `homeScore`.
3. Spoofed admin email with `request.auth.token.email_verified == false` writing to `/news/1`.
4. Shadow field injection: unauthenticated chat post `{ id: 1, sender: "Fan", message: "Hi", isAdmin: false, createdAt: "2026-11-23T12:00:00Z", adminOverride: true }`.
5. Admin badge spoofing: non-admin creating `/chatMessages/99` with `isAdmin: true`.
6. Oversized payload DoS: creating `/chatMessages/100` with `message.size() > 240`.
7. Malformed ID poisoning: accessing `/news/../../admins` or doc ID exceeding 128 chars.
8. Vote tampering: spectator updating `/nominees/1` changing `votes` by `+500` instead of `+1`.
9. Vote field takeover: spectator updating `/nominees/1` changing `isWinner: true` alongside `votes + 1`.
10. Closed-poll voting: spectator incrementing `votes` when `/platform/ballonDor.data.votingEnabled == false`.
11. Roster scraping: unauthenticated client calling `list` or `get` on `/managedUsers`.
12. Privilege escalation: non-admin user writing `/admins/{selfUid}` to grant themselves admin rights.
