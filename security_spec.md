# Security Specification — Muse Sales Manager Per-Email Workspace Firestore Rules

## 1. Data Invariants
1. **No Fixed Admin Email**: No hardcoded or fixed administrator email exists anywhere in the rules. Any user can create or access an isolated workspace keyed by their normalized email's deterministic SHA-256 workspace ID (`^ws_[0-9a-f]{40}$`).
2. **Non-Enumerable Workspaces**: Listing `/workspaces` is strictly denied (`allow list: if false;`) so no user can discover or enumerate other users' email workspaces.
3. **Strict Workspace Partitioning & Referential Integrity**:
   - Every subcollection (`clients`, `sales`, `replacements`, `settings`) requires `isValidWorkspaceId(workspaceId)` and `exists(/databases/$(database)/documents/workspaces/$(workspaceId))`.
   - Every `sale` MUST reference an existing `client` inside the SAME workspace via `exists(/databases/$(database)/documents/workspaces/$(workspaceId)/clients/$(incoming().clientId))`.
   - Every `replacement` MUST reference an existing `sale` and existing `client` inside the SAME workspace.
   - `settings` only permits the singleton document ID `global` and forbids deletion.
4. **Immutable Creation & Identity Keys**: `id`, `createdAt`, `email` (on workspace profile), `saleCode`, `replacementCode`, and `originalSaleId` cannot be mutated after creation.
5. **Strict Schema & Range Bounds**:
   - All document IDs match `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
   - `accountVolumeBillions` is between `1` and `31`.
   - `warrantyDurationDays` is between `1` and `25`.
   - `notes` <= 2000 chars.
   - Strict `keys().hasAll(...)` and `keys().hasOnly(...)` on every entity to block shadow fields.
   - Legacy global paths (`/clients`, `/sales`, `/replacements`, `/settings`, `/admins`) remain completely blocked by the global default-deny catch-all.

## 2. Attack Payloads That Must Fail with PERMISSION_DENIED
1. Listing `/workspaces` to enumerate all registered emails/workspaces.
2. Reading or writing legacy global `/clients` or `/sales` collections.
3. Accessing `/workspaces/invalid-id/sales` with a malformed workspace ID not matching `^ws_[0-9a-f]{40}$`.
4. Creating a client or sale under a non-existent workspace document.
5. Shadow field injection (`isAdmin: true` or `ghost: 1`) on workspace, client, sale, replacement, or settings writes.
6. Path poisoning with oversized or invalid document IDs (`../../etc/passwd` or > 128 chars).
7. Orphaned sale creation pointing to a `clientId` that does not exist in the same workspace.
8. Cross-workspace reference: creating a replacement pointing to a `saleId` or `clientId` from another workspace.
9. Out-of-bounds `accountVolumeBillions: 99` or `warrantyDurationDays: 45` on sale creation.
10. Oversized `notes` string (> 2000 chars) on client, sale, or replacement writes.
11. Mutating immutable `email`, `id`, or `createdAt` on `/workspaces/{workspaceId}` update, or deleting `/workspaces/{workspaceId}`.
12. Creating arbitrary settings document IDs other than `global`, or deleting `settings/global`.
