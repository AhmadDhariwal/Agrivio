# Repository Agent Instructions

## Source of Truth

Start with `docs/PROJECT_INDEX.md`.

For assigned work, read only:

1. This `AGENTS.md`
2. The assigned task file
3. Documents and source files explicitly referenced by that task

Do not scan the entire repository unless the task cannot be completed otherwise.

## Backend Coding Convention

Agrivio backend application code under `apps/backend/` is plain CommonJS JavaScript (`require` / `module.exports`, async/await, plain functions and objects).

Do **not** add `// @ts-check` or JSDoc type annotations (`@param`, `@returns`, `@typedef`, `@type`, `@template`, `@satisfies`, and similar) to normal backend source. Prefer simple readable JavaScript and rely on runtime validation, ESLint, and meaningful automated tests.

Do not convert the frontend or shared TypeScript packages to JavaScript for stylistic consistency.

## Git Ownership

The coding agent must:

* Work only on the currently checked-out branch
* Never create, rename, delete, or switch branches
* Never run `git commit`
* Never run `git push`
* Never force-push
* Never create a pull request
* Never rewrite Git history
* Never run destructive Git cleanup commands

The user owns branch creation, commits, pushes, tags, and pull requests.

## Implementation Workflow

For each requested phase:

1. Read only the relevant frozen specifications and current implementation.
2. Implement the requested work-item IDs.
3. Run focused tests during implementation.
4. Run the complete applicable phase gate once at the end.
5. Fix implementation failures within scope.
6. Update only the named phase task record and concise progress navigation.
7. Return a compact completion report and suggested commit message.

Do not create extra planning, correction, review, or summary documents unless explicitly requested.

Do not repeat requirements already defined in frozen documents.

Do not begin later work-item IDs.

Do not modify unrelated files.

Documentation-only warnings must not block implementation unless they affect correctness, security, data integrity, or executable validation.

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
* Every new or changed persisted model must pass `docs/MODEL_REVIEW_CHECKLIST.md` before the owning roadmap task is considered complete.

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
* Suggested commit message (when implementation work is complete; the user creates the commit)
