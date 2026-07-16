# Data Model

## Entity-Relationship Diagram

An ER diagram is more appropriate than a UML class diagram for this system because:

- There is no class inheritance or polymorphism — these are flat data records
- The relationship is ownership/association (Account owns Items), not inheritance
- DynamoDB single-table design does not map to relational tables or OOP classes
- ER diagrams clearly express cardinality (one Account → many Items)

```mermaid
erDiagram
    ACCOUNT {
        string uuid PK "v4 UUID (synthetic key)"
        number shopUid "Sequential account number"
        string firstName "Optional"
        string lastName "Optional"
        string company "Optional"
        string street "Optional (address_line_1)"
        string addressLine2 "Optional"
        string place "Optional (city)"
        string postcode "Optional (postal_code)"
        string canton "Optional (state)"
        string email "Optional"
        string telephone "Optional (phone_number)"
        number balance "CHF cents, default 0"
        number defaultSplit "0-1 decimal, consignor percentage"
        string defaultTerms "Return To Consignor | Donate | Discard"
        string defaultInventoryType "Consignment | Retail"
        number numberOfItems "Default 0"
        number numberOfPurchases "Default 0"
        string lastSettlement "Optional, ISO 8601 UTC"
        string lastItemEntered "Optional, ISO 8601 UTC"
        string lastActivity "Optional, ISO 8601 UTC"
        boolean isVendor "Default false"
        boolean taxExempt "Default false"
        boolean emailNotificationsEnabled "Default true"
        object createdBy "Optional, { id, name, userType }"
        list locations "Optional, array of { id, name }"
        list tags "String array"
        string deleted "Optional, ISO 8601 UTC if soft-deleted"
        string sourceId "Optional, external system ID"
        string createdAt "ISO 8601 UTC"
        string updatedAt "ISO 8601 UTC"
    }

    EMPLOYEE {
        string uuid PK "v4 UUID (synthetic key)"
        string name "Required"
        string sourceId "External system ID (ConsignCloud employee UUID)"
        string createdAt "ISO 8601 UTC"
        string updatedAt "ISO 8601 UTC"
    }

    CATEGORY {
        string uuid PK "v4 UUID (synthetic key)"
        string name "Required"
        string sourceId "External system ID (ConsignCloud category UUID)"
        string createdAt "ISO 8601 UTC"
        string updatedAt "ISO 8601 UTC"
    }

    ITEM {
        string uuid PK "v4 UUID (synthetic key)"
        number sku "Sequential number (shopUid), auto-generated from counter"
        string accountId FK "UUID of owning Account"
        string createdBy FK "UUID of Employee who created the item"
        string categoryId FK "UUID of Category"
        string title "Required, max 200 chars"
        number tagPrice "CHF, 0-999999.99"
        number quantity "1-9999"
        number split "0-100, consignor percentage"
        string inventoryType "Consignment | Retail"
        string terms "Return To Consignor | Donate | Discard"
        boolean taxExempt "Default false"
        string description "Optional, max 2000 chars"
        string category "Optional"
        string brand "Optional"
        string color "Optional"
        string size "Optional"
        string shelf "Optional"
        string details "Optional, rich text, max 5000 chars"
        list tags "Optional, max 20 items"
        string expirationDate "Optional, ISO 8601"
        list imageKeys "Optional, S3 keys, max 10"
        string createdAt "ISO 8601 UTC"
        string updatedAt "ISO 8601 UTC"
    }

    SEQUENCE_COUNTER {
        string type PK "ACCOUNT, ITEM, or SALE"
        number value "Current counter value"
    }

    SALE {
        string uuid PK "v4 UUID (synthetic key)"
        number number "Sequential sale number, auto-generated from counter"
        string status "open | finalized | voided"
        string cashierId FK "UUID of Employee who made the sale"
        number subtotal "CHF cents"
        number total "CHF cents"
        number storePortion "CHF cents"
        number consignorPortion "CHF cents"
        number change "CHF cents"
        string memo "Optional"
        string finalizedAt "Optional, ISO 8601 UTC"
        string voidedAt "Optional, ISO 8601 UTC"
        string sourceId "ConsignCloud sale UUID"
        string createdAt "ISO 8601 UTC"
    }

    SALE_LINE_ITEM {
        string saleId FK "UUID of parent Sale"
        string itemId FK "UUID of Item sold"
        number salePrice "CHF cents, price at time of sale"
        number discount "CHF cents, discount applied"
        number consignorPortion "CHF cents"
        number storePortion "CHF cents"
    }

    ACCOUNT ||--o{ ITEM : "owns"
    EMPLOYEE ||--o{ ITEM : "created"
    CATEGORY ||--o{ ITEM : "categorises"
    EMPLOYEE ||--o{ SALE : "cashier"
    SALE ||--|{ SALE_LINE_ITEM : "contains"
    ITEM ||--o{ SALE_LINE_ITEM : "sold in"
    SEQUENCE_COUNTER ||--|| ACCOUNT : "generates shopUid"
    SEQUENCE_COUNTER ||--|| ITEM : "generates SKU"
    SEQUENCE_COUNTER ||--|| SALE : "generates number"
```

## DynamoDB Single-Table Mapping

Both entities live in the same DynamoDB table (`thymos-{environment}-shop`). The ER diagram above shows the logical domain model; below is how it maps to physical key patterns:

| Entity           | PK                    | SK                    | GSI1PK     | GSI1SK                  |
|------------------|-----------------------|-----------------------|------------|-------------------------|
| Account          | `ACCOUNT#<uuid>`      | `METADATA`            | `ACCOUNTS` | `ACCOUNT#<shopUid>`     |
| Employee         | `EMPLOYEE#<uuid>`     | `METADATA`            | —          | —                       |
| Category         | `CATEGORY#<uuid>`     | `METADATA`            | —          | —                       |
| Item             | `ITEM#<uuid>`         | `METADATA`            | `ITEMS`    | `ITEM#<sku>`            |
| Sale             | `SALE#<uuid>`         | `METADATA`            | `SALES`    | `SALE#<number>`         |
| Sale Line Item   | `SALE#<uuid>`         | `LINE_ITEM#<index>`   | —          | —                       |
| Account Counter  | `SEQUENCE#ACCOUNT`    | `COUNTER`             | —          | —                       |
| Item Counter     | `SEQUENCE#ITEM`       | `COUNTER`             | —          | —                       |
| Sale Counter     | `SEQUENCE#SALE`       | `COUNTER`             | —          | —                       |

### Key Design Principles

- **Synthetic keys only**: UUIDs for identity, never business values (shopUid, SKU) as partition keys
- **Business identifiers as attributes**: shopUid and SKU are queryable via GSI1 but never used as primary keys
- **SKU is the item's shopUid**: The SKU is a sequential number (e.g., `42`) auto-generated from the item sequence counter — the same concept as `shopUid` for accounts. It is the operator-facing identifier for items, labelled "SKU" in the UI.
- **Relationship via attribute**: Items reference their owning Account by storing `accountId` (the Account's UUID), and their creator by storing `createdBy` (the Employee's UUID)
- **Employee lookup**: Employees are looked up by `sourceId` via the `sourceId-index` GSI (same as accounts). No sequential numbering — they're referenced, not browsed.
- **Sale line items**: Stored under the same PK as the sale (`SALE#<uuid>`) with SK `LINE_ITEM#<index>`. This allows fetching a sale and all its line items in a single Query. Each line item references the Item UUID and stores the price/portions at time of sale.
- **Sale number**: A sequential number auto-generated from the sale sequence counter — the operator-facing identifier for sales. Queryable via GSI1 (`GSI1PK: SALES`, `GSI1SK: SALE#<number>`).
- **Sequence counters**: Separate counter records for each entity type, atomically incremented via DynamoDB conditional expressions

## Enumerations

### Inventory Type

| Value          | Description                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Consignment`  | Item remains the property of the consignor account until sold. The shop takes a percentage (100 − split) and the consignor receives the split percentage of the sale price.    |
| `Retail`       | Item is sold by the shop on behalf of a partner retailer. The partner supplies stock and the shop sells it under an agreed arrangement.                                        |

> **Future**: A `Bought` type may be added to represent items the shop has purchased outright from a consignor or supplier. In that case the shop owns the item and the consignor has already been paid.

### Terms

| Value                  | Description                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Return To Consignor`  | When the consignment period expires or the item is withdrawn, return the unsold item to the consignor account.          |
| `Donate`               | When the consignment period expires, donate the unsold item rather than returning it.                                   |
| `Discard`              | When the consignment period expires, dispose of the unsold item.                                                        |

### Sale Status

| Value        | Description                                                                       |
| ------------ | --------------------------------------------------------------------------------- |
| `open`       | Sale is in progress (items added but not yet paid/finalized).                     |
| `finalized`  | Sale is complete — payment received, items marked as sold.                        |
| `voided`     | Sale was cancelled after creation.                                                |
