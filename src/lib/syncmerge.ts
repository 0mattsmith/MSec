/*
 * Reconciling the local vault with what Firestore has.
 *
 * The naive version of this — trusting the snapshot and replacing local state
 * with it — destroys data. Firestore's first snapshot after sign-in reflects
 * the remote only, and the remote is empty whenever the account is new to that
 * project: a fresh Firebase project, a new Google account, or simply the first
 * time this user has ever synced. Replacing local items with an empty array
 * then lets the persistence effect encrypt that emptiness over the stored
 * vault, and the entries are gone.
 *
 * So the first snapshot of a session is a merge rather than a handover.
 * Afterwards the remote is authoritative, because by then we have pushed
 * everything of ours into it and later snapshots are genuine changes from
 * other devices.
 *
 * Deletions survive this because MSec deletes softly: a removed entry keeps its
 * id and gains a deletedAt, so it travels as a tombstone and wins on recency
 * like any other edit. A merge that dropped tombstones would resurrect deleted
 * passwords on every sign-in, which is precisely the failure a password manager
 * cannot have.
 */

export interface Syncable {
  id: string;
  updatedAt?: number;
}

export interface MergeResult<T> {
  /** What the vault should now hold. */
  merged: T[];
  /** Entries the remote is missing or holds an older copy of. */
  toUpload: T[];
}

/**
 * Union by id, newest updatedAt wins.
 *
 * A missing updatedAt counts as 0, so a well-formed entry always beats a
 * malformed one rather than the comparison going undefined and silently
 * picking whichever side happened to be tested first.
 */
export function mergeSync<T extends Syncable>(local: T[], remote: T[]): MergeResult<T> {
  const stamp = (x: T) => (typeof x.updatedAt === 'number' ? x.updatedAt : 0);

  const byId = new Map<string, T>();
  for (const r of remote) {
    if (r && r.id) byId.set(r.id, r);
  }

  const toUpload: T[] = [];

  for (const l of local) {
    if (!l || !l.id) continue;
    const r = byId.get(l.id);
    if (!r) {
      // Remote has never seen this one.
      byId.set(l.id, l);
      toUpload.push(l);
    } else if (stamp(l) > stamp(r)) {
      // Ours is the newer edit; the remote needs correcting.
      byId.set(l.id, l);
      toUpload.push(l);
    }
    // Otherwise the remote copy is newer or identical — leave it be.
  }

  return { merged: [...byId.values()], toUpload };
}
