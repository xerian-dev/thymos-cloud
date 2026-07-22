# Design Principles

## General

- "It already works" is never sufficient justification for a design decision. Evaluate against principles and best practices first.
- Do not introduce technical debt in a pre-launch application. There is no release pressure to justify shortcuts.
- When you spot a violation of established principles in existing code, flag it — don't defend it.

## Follow Existing Patterns

- Before writing new code that does something similar to existing code, READ the existing implementation first and follow its pattern exactly.
- When building a new entity flow (e.g., sale import), find the equivalent working flow (e.g., item import) and replicate its structure, conventions, and API usage patterns.
- Do NOT reinvent how to call an external API when a working client already exists for a different entity. Copy the approach.
- If the existing pattern uses `url.searchParams.append()` in a loop, do the same. If it uses a batch sync orchestrator, do the same. If it doesn't, don't build one.
- This applies to: API client code, DynamoDB access patterns, Lambda handler structure, Step Function phase management, error handling, and test patterns.

## Data Modelling

- Never use a business-visible value (account numbers, SKUs, email addresses, etc.) as a primary key. Use synthetic keys (UUIDs) for identity.
- Business identifiers are attributes, not keys. They may change, be reassigned, or have duplicates discovered later.
- This applies equally to DynamoDB partition keys and relational primary keys — the reasoning is the same regardless of database engine.

## DynamoDB Specifics

- DynamoDB keys are immutable — you cannot update a key, only delete and recreate. This makes natural key mistakes especially costly.
- Use the pattern: `PK: "<TYPE>#<uuid>"`, `SK: "METADATA"` for entity records.
- Store business identifiers (account number, SKU, etc.) as regular attributes with GSIs for lookup/sort access patterns.
- Plan GSI strategy around access patterns, not convenience. Overloaded GSIs are preferred when approaching the 20 GSI limit.

## Decision Making

- Prefer correctness over convenience.
- Prefer established principles over "it works for now".
- When evaluating trade-offs, state the principle being violated and require explicit justification if proceeding anyway.
