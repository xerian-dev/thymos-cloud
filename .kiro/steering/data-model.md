# Data Model Reference

When adding or modifying features that involve entities, database records, or enumerations, always consult the canonical data model document first:

[[file:../../docs/data-model.md]]

This document defines:

- Entity attributes and relationships (Account, Item)
- DynamoDB key patterns and GSI mappings
- Enumeration values and their business meaning (Inventory Type, Terms)
- Sequence counter patterns

Always check this document before introducing new entity types, fields, or enumeration values.
