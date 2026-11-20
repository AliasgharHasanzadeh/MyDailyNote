# Security Specification — Vellum Personal Workspace

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every workspace record (`folders`, `notes`, `tasks`, `goals`, `preferences`) lives under `/users/{userId}/...` AND stores `ownerId == request.auth.uid`. Only an authenticated user with a verified email (`request.auth.token.email_verified == true`) whose `uid == userId` may read, create, update, or delete records in their own subtree.
2. **Parent Existence (Master Gate)**: Subcollection document creation under `/users/{userId}/...` requires the parent `/users/{userId}` document to exist (`exists(...)` or `existsAfter(...)` in a batch).
3. **Immutability & Temporal Integrity**: `id`, `ownerId`, and `createdAt` cannot be modified after creation. All `createdAt` (on create) and `updatedAt` (on create & update) fields must equal `request.time`.
4. **Shadow-Field & Exhaustion Prevention**: Every entity enforces `hasAll` + `hasOnly`, bounded string `.size()` limits, bounded list `.size()` limits, and `isValidId()` regex validation (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
5. **No Blanket Reads or Client Query Trust**: Catch-all denies everything by default; `allow list` strictly enforces `resource.data.ownerId == request.auth.uid` without `get()` or `exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read**: Anonymous client attempts `get /users/u1/notes/note_1` -> `PERMISSION_DENIED`.
2. **Cross-Tenant Read**: Signed-in user `u2` attempts `get /users/u1/notes/note_1` -> `PERMISSION_DENIED`.
3. **Cross-Tenant List Scraping**: Signed-in user `u2` attempts `list /users/u1/notes` -> `PERMISSION_DENIED`.
4. **Unverified Email Write**: Signed-in user with `email_verified: false` attempts `create /users/u1/notes/note_1` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: User `u1` sends `ownerId: "u2"` when creating `/users/u1/notes/note_1` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: User `u1` creates a note with an extra unexpected key `isAdmin: true` -> `PERMISSION_DENIED`.
7. **ID Poisoning**: User `u1` attempts to create `/users/u1/notes/bad..id$$$` -> `PERMISSION_DENIED`.
8. **Timestamp Forgery**: User `u1` creates a task with a backdated client timestamp instead of `request.time` -> `PERMISSION_DENIED`.
9. **Immortal Field Mutation**: User `u1` updates a note changing `createdAt` or `ownerId` -> `PERMISSION_DENIED`.
10. **Denial-of-Wallet Oversized String**: User `u1` attempts to write a `title` > 300 chars or `plainText` > 200,000 chars -> `PERMISSION_DENIED`.
11. **Unbounded Array Attack**: User `u1` attempts to write 30 tags (`tags.size() > 25`) or non-string tag elements -> `PERMISSION_DENIED`.
12. **Out-of-Range Enum / Number**: User `u1` updates a task with `status: "hacked"` or goal `manualProgress: 999` -> `PERMISSION_DENIED`.
