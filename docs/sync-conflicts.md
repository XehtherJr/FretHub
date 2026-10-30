# Library sync conflict policy

## Current decision

Keep the existing per-item last-writer-wins policy for this release; do not silently introduce a
new server schema or a misleading automatic merge of musical edits. A favorite, chord note, lesson
challenge or **whole progression** is one item. Independent items merge; concurrent changes to the
same item do not merge field by field. Deletions are timestamped tombstones so a later sync does not
normally bring removed items back. This is a compatibility decision, not a guarantee that users will
never lose a conflicting edit.

Each device assigns a millisecond timestamp when it edits an item, monotonically increasing it above
its own previous stamp for that item. The larger timestamp wins. If timestamps are exactly equal,
the canonical JSON representations of the values are compared and the lexicographically smaller one
wins, consistently on all devices. This tie-break is deterministic, not a judgment of which edit is
musically better. Because timestamps come from device clocks, clock skew or a clock set into the future
can make an older real-world change win. A progression is saved as a whole: two people/devices changing
different chords in the same progression can still overwrite one another. There is no conflict review
or version history in the UI.

Cloud writes use a revision check and retry after another device changes the row. The client also
re-reads and merges local edits made during an in-flight request before applying the result, scheduling
another sync if needed. Unrecognized or malformed snapshot fields, entries and local account backups
stop the relevant write/sync; they are not normalized away. The original data must be recovered with a
compatible client or backup. A newer client can still produce data an older app does not understand.

## Local coordination and limits

Current tabs on the same origin use an IndexedDB readwrite transaction to serialize local library
mutations, owner changes and the local read/apply phases of sync. A fixed-size localStorage fence
paired with the IndexedDB mutex makes a tab wait until it has observed the preceding write, rather than
using a stale renderer cache. Each tab is bound to the local owner it observed; a stale tab cannot
write after another tab switches owners. If coordination is unavailable, mutations fail closed. The
first account adopts a guest library; signing out leaves the last account's copy on the device, and
subsequent guest edits to it are merged when that account signs in again. An unsaved note or progression draft stays bound to its original owner: if the active
account changes, saving is blocked until that owner is active again; an unowned guest draft may be
adopted by the first account. Recent chords and quiz totals are device-local and are not synced or
isolated by account.

A localStorage write-ahead journal stores prior values before a multi-key write. An interrupted write
is rolled back under the lock; unknown journal fields, keys or duplicate entries are left untouched.
If browser storage still cannot recover it, reads/edits fail closed until recovery succeeds. An
interrupted coordination-fence update can also leave a persistent mismatch; in that case writes stop
and the data need careful recovery rather than an automatic reset. This coordinates **cooperating
current tabs only**: old open versions, other scripts, extensions, browser data clearing, and storage
corruption do not honor the lock. Close
or refresh all FretHub tabs when upgrading. The journal is not a backup and can itself be removed by
clearing site data. A storage failure may make recovery unavailable; do not claim localStorage is an
atomic cross-tab database. Network requests already sent cannot be recalled after a sign-out, although
the captured snapshot is owner-checked and local application is checked again.

If the app reports unsupported, inconsistent or interrupted local data, there is no automatic repair
or conflict-review UI. Do not clear site data or use an older tab to overwrite it. Before attempting
recovery, preserve all `frethub:` localStorage keys—including account backups, the transaction
journal and coordination fence—and the `frethub-library-coordination` IndexedDB database together in
a private, user-controlled backup. Use a compatible version or restore a verified backup; restoring
only one half of the coordination pair can leave writes blocked. Those values can contain private
notes; do not paste them into public issue reports. If the unsupported data is in the cloud, it is
left in place and sync stops instead of uploading a partial snapshot. Storage permissions or quota may need attention before rollback can finish.

## Practical guidance and future decisions

Sync before editing on another device; keep device clocks accurate and avoid editing the same note or
progression concurrently. Maintain an independent backup of important work. If retaining both versions,
a conflict picker, server-assigned ordering, or shared editing is required, first define expected
behavior for offline edits, deletes, clock skew, account changes, old clients, and storage limits, then
add migrations and end-to-end tests in isolated staging. No such policy or server migration is implied
by the current implementation.
