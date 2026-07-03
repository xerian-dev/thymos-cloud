# Design Principles

## General

- "It already works" is never sufficient justification for a design decision. Evaluate against principles and best practices first.
- Do not introduce technical debt in a pre-launch application. There is no release pressure to justify shortcuts.
- When you spot a violation of established principles in existing code, flag it — don't defend it.

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
