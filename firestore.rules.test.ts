/**
 * Security Rules Specification Verification Suite (Dirty Dozen + Valid Paths)
 * Covers all entities in firebase-blueprint.json against firestore.rules.
 */

export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Unauthenticated get on note',
    auth: null,
    operation: 'get',
    path: '/users/user_a/notes/note_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Cross-tenant get on user profile (PII / private isolation)',
    auth: { uid: 'user_b', email_verified: true },
    operation: 'get',
    path: '/users/user_a',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Cross-tenant list on notes',
    auth: { uid: 'user_b', email_verified: true },
    operation: 'list',
    path: '/users/user_a/notes',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Unverified email write',
    auth: { uid: 'user_a', email_verified: false },
    operation: 'create',
    path: '/users/user_a/notes/note_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Identity spoofing (ownerId != auth.uid)',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'create',
    path: '/users/user_a/notes/note_1',
    payload: { id: 'note_1', ownerId: 'user_b' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Shadow field injection',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'create',
    path: '/users/user_a/folders/fld_1',
    payload: { id: 'fld_1', ownerId: 'user_a', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Path variable ID poisoning',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'create',
    path: '/users/user_a/tasks/invalid..task$id',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Client-forged timestamp on create',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'create',
    path: '/users/user_a/tasks/task_1',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Immortal createdAt mutation on update',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'update',
    path: '/users/user_a/notes/note_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Oversized title string (>300 chars)',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'create',
    path: '/users/user_a/notes/note_2',
    payload: { title: 'a'.repeat(301) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Oversized tags array (>25 tags)',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'update',
    path: '/users/user_a/notes/note_1',
    payload: { tags: Array.from({ length: 26 }, (_, i) => `t${i}`) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Invalid enum status on task & out-of-range goal progress',
    auth: { uid: 'user_a', email_verified: true },
    operation: 'update',
    path: '/users/user_a/tasks/task_1',
    payload: { status: 'super_admin' },
    expected: 'PERMISSION_DENIED',
  },
] as const;
