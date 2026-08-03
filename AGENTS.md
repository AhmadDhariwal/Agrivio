# Repository Agent Instructions

## Source of Truth

Start with `docs/PROJECT_INDEX.md`.

For assigned work, read only:

1. This `AGENTS.md`
2. The assigned task file
3. Documents and source files explicitly referenced by that task

Do not scan the entire repository unless the task cannot be completed otherwise.

## Scope Control

Implement only the assigned task.

Do not:

* Add unrequested features
* Change finalized product decisions
* Rename established domain concepts
* Refactor unrelated files
* Add speculative abstractions
* Add placeholder implementations
* Leave unresolved TODOs
* Leave commented-out code
* Duplicate existing utilities or business logic
* Modify generated files manually

## Architecture Rules

* The project uses a MEAN-stack modular monolith.
* Angular code must remain feature-based.
* Backend controllers must remain thin.
* Business logic belongs in services.
* Database access must not be placed in controllers.
* Every tenant-owned operation must enforce tenant isolation.
* Financial and inventory workflows must use database transactions where multiple records are affected.
* Posted financial and stock transactions must never be permanently deleted.

## Documentation Rules

* Do not duplicate the same rule across multiple documents.
* Link to the authoritative document instead.
* Clearly distinguish finalized decisions from future ideas.
* Do not convert recommendations into requirements without approval.
* Update `docs/PROJECT_INDEX.md` when adding an authoritative document.

## Quality Gate

Before reporting completion:

1. Review all changed files.
2. Confirm no unrelated files were modified.
3. Run every command required by the task.
4. Report failures honestly.
5. Update affected documentation.
6. Confirm no placeholder or incomplete implementation remains.

## Completion Report

Return only:

* Summary
* Files changed
* Validation performed
* Documentation updated
* Remaining risks or blockers
* Confirmation that no unrelated changes were made
