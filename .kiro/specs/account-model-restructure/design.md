# Design Document: Account Model Restructure

## Overview

This design restructures the account data model across the full stack — DynamoDB schema, API validation, import pipeline, and frontend — to replace the monolithic `address` field with structured address components (`street`, `place`, `postcode`, `canton`), add a dedicated `email` field, normalize phone numbers using Swiss conventions, and assign tags based on notification preferences and mobile prefixes. The import pipeline is updated to map expanded ConsignCloud source fields (including address and phone) into the new schema and write tag items to the single-table design. No data migration is needed — accounts will be re-imported.

## Architecture

The account model lives in a DynamoDB single-table design with `PK=ACCOUNT#{number}` and `SK=METADATA`. Tags are stored as separate items with `PK=ACCOUNT#{number}` and `SK=TAG#{tag_name}`. The restructure touches four layers:

1. **API Layer** — Validation and response mapping (`validation.ts`, `create-account.ts`, `list-accounts.ts`)
2. **Import Pipeline** — Field mapping, phone normalization, tag assignment, and sync (`field-mapper.ts`, `sync-to-shop-table.ts`)
3. **Frontend Types** — TypeScript interfaces (`accounts-types.ts`)
4. **Frontend Components** — Form and table (`account-form.tsx`, `accounts-columns.tsx`, `accounts-validation.ts`)

No infrastructure changes are required — DynamoDB is schemaless and new attributes are written directly.

## Components and Interfaces

### 1. ConsignCloudAccount Interface (`field-mapper.ts`)

**Current state:** Has `id`, `number`, `first_name`, `last_name`, `company`, `email`, `balance`, `email_notifications_enabled`, `created`, `deleted`.

**New state:** Add `phone_number`, `address_line_1`, `address_line_2`, `city`, `state`, `postal_code` as optional string properties.

```typescript
export interface ConsignCloudAccount {
  id: string;
  number: string;
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone_number?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  balance: number;
  email_notifications_enabled: boolean;
  created: string;
  deleted?: string;
}
```

### 2. Phone Normalizer (`field-mapper.ts`)

A pure function that strips Swiss country code prefixes and prepends `0`:

```typescript
export function normalizeSwissPhone(phone: string | undefined | null): string {
  if (!phone) {
    return "";
  }
  if (phone.startsWith("+41")) {
    return "0" + phone.slice(3);
  }
  if (phone.startsWith("0041")) {
    return "0" + phone.slice(4);
  }
  return phone;
}
```

### 3. Tag Assignment (`field-mapper.ts`)

A pure function that derives tags from source data and the normalized phone number:

```typescript
export function deriveImportTags(
  emailNotificationsEnabled: boolean,
  normalizedPhone: string,
): string[] {
  const tags: string[] = [];

  if (emailNotificationsEnabled) {
    tags.push("email_notification");
  }

  if (
    normalizedPhone.startsWith("079") ||
    normalizedPhone.startsWith("078") ||
    normalizedPhone.startsWith("077")
  ) {
    tags.push("text_notification");
  }

  return tags;
}
```

### 4. Import Field Mapper (`field-mapper.ts`)

**Changes:**

- Add `street`, `place`, `postcode`, `canton`, `email`, `telephone` and `tags` to `MappedAccountFields`
- Implement street concatenation logic for address_line_1 + address_line_2
- Map `city` → `place`, `postal_code` → `postcode`, `state` → `canton` (null defaults to `""`)
- Map `email` → `email`
- Normalize `phone_number` → `telephone`
- Derive tags from `email_notifications_enabled` and normalized phone prefix

```typescript
export interface MappedAccountFields {
  name: string;
  company: string;
  street: string;
  place: string;
  postcode: string;
  canton: string;
  email: string;
  telephone: string;
  tags: string[];
}

export function buildStreet(
  addressLine1: string | undefined | null,
  addressLine2: string | undefined | null,
): string {
  if (addressLine1 && addressLine2) {
    return `${addressLine1}, ${addressLine2}`;
  }
  if (addressLine1) {
    return addressLine1;
  }
  if (addressLine2) {
    return addressLine2;
  }
  return "";
}

export function mapConsignCloudToShop(
  source: ConsignCloudAccount,
): MappedAccountFields {
  const name: string = `${source.first_name} ${source.last_name}`.trim();
  const telephone: string = normalizeSwissPhone(source.phone_number);
  const tags: string[] = deriveImportTags(
    source.email_notifications_enabled,
    telephone,
  );

  return {
    name,
    company: source.company,
    street: buildStreet(source.address_line_1, source.address_line_2),
    place: source.city ?? "",
    postcode: source.postal_code ?? "",
    canton: source.state ?? "",
    email: source.email,
    telephone,
    tags,
  };
}
```

### 5. Change Detection (`field-mapper.ts`)

Updated to compare all new fields plus tags:

```typescript
export interface ExistingAccountFields {
  name: string;
  company?: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  tags?: string[];
}

export function hasFieldChanges(
  existing: ExistingAccountFields,
  mapped: MappedAccountFields,
): boolean {
  if (existing.name !== mapped.name) return true;
  if ((existing.company ?? "") !== mapped.company) return true;
  if ((existing.street ?? "") !== mapped.street) return true;
  if ((existing.place ?? "") !== mapped.place) return true;
  if ((existing.postcode ?? "") !== mapped.postcode) return true;
  if ((existing.canton ?? "") !== mapped.canton) return true;
  if ((existing.email ?? "") !== mapped.email) return true;
  if ((existing.telephone ?? "") !== mapped.telephone) return true;

  const existingTags = [...(existing.tags ?? [])].sort();
  const mappedTags = [...mapped.tags].sort();
  if (
    existingTags.length !== mappedTags.length ||
    existingTags.some((tag, i) => tag !== mappedTags[i])
  ) {
    return true;
  }

  return false;
}
```

### 6. API Validator (`validation.ts`)

**Current state:** Validates `accountNumber`, `name`, `address` (string, max 500), `telephone` (string, max 30).

**New state:** Remove `address` validation. Add optional fields: `street` (max 200), `place` (max 100), `postcode` (max 20), `canton` (max 50), `email` (max 254). `telephone` remains optional (max 30).

```typescript
export interface CreateAccountInput {
  accountNumber: number;
  name: string;
  street: string;
  place: string;
  postcode: string;
  canton: string;
  email: string;
  telephone: string;
}

export function validateCreateAccount(body: unknown): ValidationResult {
  // ... existing accountNumber and name validation ...

  // Validate street (optional, max 200)
  if (input.street !== undefined && input.street !== null) {
    if (typeof input.street !== "string") {
      errors.push({ field: "street", message: "street must be a string" });
    } else if (input.street.length > 200) {
      errors.push({ field: "street", message: "street must be at most 200 characters" });
    }
  }

  // Validate place (optional, max 100)
  if (input.place !== undefined && input.place !== null) {
    if (typeof input.place !== "string") {
      errors.push({ field: "place", message: "place must be a string" });
    } else if (input.place.length > 100) {
      errors.push({ field: "place", message: "place must be at most 100 characters" });
    }
  }

  // Validate postcode (optional, max 20)
  if (input.postcode !== undefined && input.postcode !== null) {
    if (typeof input.postcode !== "string") {
      errors.push({ field: "postcode", message: "postcode must be a string" });
    } else if (input.postcode.length > 20) {
      errors.push({ field: "postcode", message: "postcode must be at most 20 characters" });
    }
  }

  // Validate canton (optional, max 50)
  if (input.canton !== undefined && input.canton !== null) {
    if (typeof input.canton !== "string") {
      errors.push({ field: "canton", message: "canton must be a string" });
    } else if (input.canton.length > 50) {
      errors.push({ field: "canton", message: "canton must be at most 50 characters" });
    }
  }

  // Validate email (optional, max 254)
  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== "string") {
      errors.push({ field: "email", message: "email must be a string" });
    } else if (input.email.length > 254) {
      errors.push({ field: "email", message: "email must be at most 254 characters" });
    }
  }

  // Validate telephone (optional, max 30)
  if (input.telephone !== undefined && input.telephone !== null) {
    if (typeof input.telephone !== "string") {
      errors.push({ field: "telephone", message: "telephone must be a string" });
    } else if (input.telephone.length > 30) {
      errors.push({ field: "telephone", message: "telephone must be at most 30 characters" });
    }
  }

  // ...
}
```

### 7. Create Account Route (`create-account.ts`)

**Changes:**

- Destructure `street`, `place`, `postcode`, `canton`, `email`, `telephone` from validated data (no more `address`)
- Write these fields to the DynamoDB item
- Return them in the 201 response

```typescript
const { accountNumber, name, street, place, postcode, canton, email, telephone } = validation.data;

const accountItem = {
  PK: pk,
  SK: "METADATA",
  uuid,
  name,
  street: street ?? "",
  place: place ?? "",
  postcode: postcode ?? "",
  canton: canton ?? "",
  email: email ?? "",
  telephone: telephone ?? "",
  createdAt,
};
```

### 8. List Accounts Route (`list-accounts.ts`)

**Changes:**

- Map `street`, `place`, `postcode`, `canton`, `email` from DynamoDB items instead of `address`
- Query TAG# items for each account to populate `tags` array

```typescript
const accounts = items.map((item) => ({
  uuid: item.uuid as string,
  shopUid: parseAccountPk(item.PK as string),
  name: item.name as string,
  street: (item.street as string) ?? "",
  place: (item.place as string) ?? "",
  postcode: (item.postcode as string) ?? "",
  canton: (item.canton as string) ?? "",
  email: (item.email as string) ?? "",
  telephone: (item.telephone as string) ?? "",
  company: (item.company as string) ?? "",
  commentCount: 0,
  tags: [] as string[], // populated from TAG# items
}));
```

### 9. Sync Process (`sync-to-shop-table.ts`)

**Changes:**

- Update `ShopTableAccount` interface to include all new fields
- New account creation: write `street`, `place`, `postcode`, `canton`, `email`, `telephone`; remove `address`
- Write TAG# items for each tag in `mapped.tags`
- Update expression includes all new fields
- On update, replace TAG# items with the new set
- `hasFieldChanges` comparison now includes all new fields and tags

```typescript
interface ShopTableAccount {
  PK: string;
  SK: string;
  name: string;
  company?: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  sourceId?: string;
  tags?: string[];
}

// In the create branch — write METADATA + TAG# items:
{
  Put: {
    TableName: TABLE_NAME,
    Item: {
      PK: `ACCOUNT#${paddedNumber}`,
      SK: "METADATA",
      uuid: crypto.randomUUID(),
      name: mapped.name,
      street: mapped.street,
      place: mapped.place,
      postcode: mapped.postcode,
      canton: mapped.canton,
      email: mapped.email,
      telephone: mapped.telephone,
      company: mapped.company,
      sourceId: record.id,
      createdAt: new Date().toISOString(),
    },
  },
}

// Write TAG# items for each tag:
for (const tag of mapped.tags) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ACCOUNT#${paddedNumber}`,
        SK: `TAG#${tag}`,
        tag,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

// In the update branch:
UpdateExpression: "SET #name = :name, #company = :company, #street = :street, #place = :place, #postcode = :postcode, #canton = :canton, #email = :email, #telephone = :telephone",
ExpressionAttributeNames: {
  "#name": "name",
  "#company": "company",
  "#street": "street",
  "#place": "place",
  "#postcode": "postcode",
  "#canton": "canton",
  "#email": "email",
  "#telephone": "telephone",
},
ExpressionAttributeValues: {
  ":name": mapped.name,
  ":company": mapped.company,
  ":street": mapped.street,
  ":place": mapped.place,
  ":postcode": mapped.postcode,
  ":canton": mapped.canton,
  ":email": mapped.email,
  ":telephone": mapped.telephone,
},
```

For tag updates, the sync process deletes existing TAG# items for the account and writes the new set:

```typescript
// Delete existing TAG# items
const existingTagItems = await docClient.send(
  new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :tagPrefix)",
    ExpressionAttributeValues: {
      ":pk": existing.PK,
      ":tagPrefix": "TAG#",
    },
  }),
);

for (const tagItem of existingTagItems.Items ?? []) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: tagItem.PK, SK: tagItem.SK },
    }),
  );
}

// Write new TAG# items
for (const tag of mapped.tags) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: existing.PK,
        SK: `TAG#${tag}`,
        tag,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}
```

### 10. Import Table Client (`import-table-client.ts`)

**Changes:**

- Expand `ImportedAccountRecord` interface with new fields
- Update `writeImportedAccounts` to persist new fields

```typescript
export interface ImportedAccountRecord {
  PK: string;
  SK: string;
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  balance: number;
  emailNotificationsEnabled: boolean;
  created: string;
  importedAt: string;
}
```

### 11. Frontend Types (`accounts-types.ts`)

```typescript
export interface Account {
  uuid: string;
  shopUid: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  commentCount: number;
  tags: string[];
}

export interface CreateAccountRequest {
  accountNumber: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
}
```

### 12. Frontend Validation (`accounts-validation.ts`)

Replace `address` schema with new fields:

```typescript
export const accountFormSchema = z.object({
  accountNumber: accountNumberSchema,
  name: z.string()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be at most 100 characters" })
    .refine((val) => val.trim().length > 0, {
      message: "Name must contain at least one non-whitespace character",
    }),
  street: z.string().max(200, { message: "Street must be at most 200 characters" }).default(""),
  place: z.string().max(100, { message: "Place must be at most 100 characters" }).default(""),
  postcode: z.string().max(20, { message: "Postcode must be at most 20 characters" }).default(""),
  canton: z.string().max(50, { message: "Canton must be at most 50 characters" }).default(""),
  email: z.string().max(254, { message: "Email must be at most 254 characters" }).default(""),
  telephone: z.string().max(30, { message: "Telephone must be at most 30 characters" }).default(""),
});
```

### 13. Account Form (`account-form.tsx`)

Replace the single `address` input with inputs for `street`, `place`, `postcode`, `canton`, `email`, and `telephone`. Remove `address` state/error handling.

### 14. Accounts Table Columns (`accounts-columns.tsx`)

Replace the `address` column with columns for the new fields:

```typescript
export const accountsColumns: ColumnDef<Account>[] = [
  { accessorKey: "shopUid", header: "Account #" },
  { accessorKey: "name", header: "Name", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "street", header: "Street", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "place", header: "Place", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "postcode", header: "Postcode", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "canton", header: "Canton", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "email", header: "Email", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "telephone", header: "Telephone", enableSorting: true, sortingFn: "caseInsensitive" },
  { accessorKey: "commentCount", header: "Comments" },
  { accessorKey: "tags", header: "Tags" },
];
```

## Data Models

### DynamoDB Account Item (after restructure)

| Attribute   | Type   | Required | Notes                           |
|-------------|--------|----------|---------------------------------|
| PK          | String | Yes      | `ACCOUNT#{7-digit-number}`      |
| SK          | String | Yes      | `METADATA`                      |
| uuid        | String | Yes      | UUID v4                         |
| name        | String | Yes      | Full name, 1–100 chars          |
| street      | String | No       | Max 200 chars, defaults to ""   |
| place       | String | No       | Max 100 chars, defaults to ""   |
| postcode    | String | No       | Max 20 chars, defaults to ""    |
| canton      | String | No       | Max 50 chars, defaults to ""    |
| email       | String | No       | Max 254 chars, defaults to ""   |
| telephone   | String | No       | Max 30 chars, defaults to ""    |
| company     | String | No       | From import                     |
| sourceId    | String | No       | ConsignCloud ID (GSI key)       |
| createdAt   | String | Yes      | ISO 8601 timestamp              |

The `address` attribute is removed entirely. No migration is needed — accounts will be re-imported.

### DynamoDB Tag Items

| Attribute   | Type   | Required | Notes                           |
|-------------|--------|----------|---------------------------------|
| PK          | String | Yes      | `ACCOUNT#{7-digit-number}`      |
| SK          | String | Yes      | `TAG#{tag_name}`                |
| tag         | String | Yes      | Tag name (e.g., `email_notification`, `text_notification`) |
| createdAt   | String | Yes      | ISO 8601 timestamp              |

Tags are queried by prefix `TAG#` on the account's PK.

## Error Handling

- **Validation errors**: Return 400 with field-level error messages. Each optional field that exceeds its max length produces a specific error.
- **Missing optional fields**: Treated as empty string (`""`) when writing to DynamoDB. Frontend handles `undefined` gracefully with `?? ""`.
- **Phone normalization**: Null/undefined phone numbers produce empty string — no errors thrown.
- **Tag derivation**: Pure function with no failure modes — boolean and prefix checks only.
- **Import errors**: Existing error handling in sync process is unchanged. New fields are non-nullable in the mapper output, so no new failure modes are introduced.
- **Tag write failures**: If a TAG# item write fails during sync, the record is counted as errored and logged, following the existing error-per-record pattern.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Validator enforces optional field length limits

*For any* optional string field (`street`, `place`, `postcode`, `canton`, `email`, `telephone`) and *for any* string value provided for that field, the API validator SHALL accept the value when its length is within the field's configured maximum (`street` ≤ 200, `place` ≤ 100, `postcode` ≤ 20, `canton` ≤ 50, `email` ≤ 254, `telephone` ≤ 30) and SHALL reject it with a validation error when its length exceeds the maximum.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.2, 3.2**

### Property 2: Street construction from address lines

*For any* pair of optional strings (`address_line_1`, `address_line_2`), the `buildStreet` function SHALL produce: the concatenation `"line1, line2"` when both are non-null; `line1` when only `address_line_1` is non-null; `line2` when only `address_line_2` is non-null; and `""` when both are null.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 3: Direct field mapping with null defaults

*For any* `ConsignCloudAccount`, the `mapConsignCloudToShop` function SHALL map `city` to `place`, `postal_code` to `postcode`, `state` to `canton`, and `email` to `email`, using the source value directly when non-null and defaulting to `""` when null.

**Validates: Requirements 5.5, 5.6, 5.7, 6.1**

### Property 4: Swiss phone normalization

*For any* string starting with `+41`, `normalizeSwissPhone` SHALL return `"0"` concatenated with the remainder after removing `+41`. *For any* string starting with `0041`, it SHALL return `"0"` concatenated with the remainder after removing `0041`. *For any* other non-null string, it SHALL return the string unchanged. For null/undefined input, it SHALL return `""`.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 5: Email notification tag assignment

*For any* `ConsignCloudAccount`, the `email_notification` tag SHALL be present in `mapped.tags` if and only if `email_notifications_enabled` is `true`.

**Validates: Requirements 8.1, 8.2**

### Property 6: Text notification tag assignment

*For any* `ConsignCloudAccount`, the `text_notification` tag SHALL be present in `mapped.tags` if and only if the normalized telephone number starts with `079`, `078`, or `077`.

**Validates: Requirements 8.3, 8.4**

### Property 7: Change detection covers all fields and tags

*For any* pair of existing account fields and mapped account fields, `hasFieldChanges` SHALL return `true` when any single field (`name`, `company`, `street`, `place`, `postcode`, `canton`, `email`, `telephone`) or the `tags` array differs between existing and mapped, and SHALL return `false` when all fields and tags are equal.

**Validates: Requirements 9.6**
