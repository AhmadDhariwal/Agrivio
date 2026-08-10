# Model Review Checklist

Document status: Active implementation rule  
Current version: 1.0  
Last updated: 2026-08-10  
Applies to: F03 P2 through F09 (and any later model change)

## Authority

Frozen product and technical contracts remain authoritative:

* [DATA_MODEL.md](DATA_MODEL.md)
* [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md)
* [API_DESIGN.md](API_DESIGN.md)
* [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md)
* [BUSINESS_RULES.md](BUSINESS_RULES.md)
* [DOMAIN_GLOSSARY.md](DOMAIN_GLOSSARY.md)
* Assigned roadmap work-item

This checklist does not invent product scope. It prevents incomplete, misplaced, speculative, or untested persistence work.

## Decision policy for every suspected field

| Class | Meaning | Action |
| --- | --- | --- |
| **A — Required now** | Explicitly supported by Frozen requirements / current implemented workflow | Implement |
| **B — Structurally required now** | Needed for approved relationships, lifecycle, security, indexing, or concurrency | Implement with short justification |
| **C — Useful but future scope** | Helps a later roadmap item only | Do **not** add; record owning future work-item ID |
| **D — Unsupported/speculative** | No authoritative requirement or concrete structural need | Do **not** add |

## Required review before a model task is complete

Every new or changed persisted model/collection must be checked for:

1. **Canonical module ownership** — collection lives in the owning module `persistence/`; no cross-module model imports except approved infrastructure/Audit write paths.
2. **Required current-scope fields** — only A/B fields for the assigned work-item.
3. **Required vs optional rules** — schema + service validation agree; Mongoose is not the only place business rules live.
4. **Relationships** — references use stable IDs; same-organization invariants enforced in services.
5. **Organization/platform scope** — tenant-owned records always carry `organizationId`; platform-owned records are not used to dodge tenancy.
6. **Lifecycle/status** — only states supported by current requirements; API/UI/services share the same vocabulary.
7. **Timestamps** — only meaningful lifecycle timestamps (`createdAt`/`updatedAt` plus consumed/expires/approved/etc. when required).
8. **Optimistic versioning** — mutable business master data uses `version` + `expectedVersion` conflict behavior; do not version immutable tokens needlessly.
9. **Normalized/search fields** — deterministic normalization for uniqueness/search keys currently required.
10. **Indexes and uniqueness** — only indexes justified by real queries/security/uniqueness; org-leading indexes for tenant collections.
11. **Security-sensitive fields** — hashes/secrets never returned by API; plaintext tokens issued once at most and never persisted.
12. **API representation** — domain-specific transport shape; no persistence leakage; no universal entity DTO.
13. **Frontend representation** — feature models/data-access cover required API fields without cloning Mongo schemas into global `shared`.
14. **Audit implications** — sensitive lifecycle changes write `audit_events` with actor/action/resource/org-or-platform context; do not embed full audit logs in business documents.
15. **Transaction implications** — multi-record authoritative changes use shared transaction context where Frozen rules require it.
16. **Actual utilization** — every persisted field is required/used, deliberately internal, or removed; no silent dead required fields.
17. **Migration/evolution** — classify change as backward-compatible / backfill / migration / destructive; do not silently delete local business records.
18. **Real-Mongo persistence/index tests** — isolated replica-set DB (never `Agrivio`) proves uniqueness/TTL/index behavior that matters.

## Completeness vs “complete context”

A model is complete when it owns its slice of context — not when it absorbs related concepts.

Example identity context remains split across User, Membership, AccessAssignment, Session, and tokens. Do not create giant aggregate dump documents.

## Anti-patterns

Do not introduce generic base models, generic repositories, universal DTOs, event sourcing, CQRS, schema registries, or speculative denormalization.

## Usage

Attach this checklist outcome to the phase task record (or work-item DoD notes) whenever a model is introduced or materially changed.
