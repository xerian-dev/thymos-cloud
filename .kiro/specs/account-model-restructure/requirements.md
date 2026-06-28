# Requirements Document

## Introduction

Restructure the account data model to replace the single `address` field with structured address components (`street`, `place`, `postcode`, `canton`) and add dedicated `email` and `telephone` fields. The import pipeline maps ConsignCloud source fields to the new structure, including address concatenation, phone number normalization (Swiss prefix stripping), and conditional tag assignment based on notification preferences and mobile prefixes. The `ConsignCloudAccount` interface is expanded with address and phone fields. All new fields are optional strings. No data migration is needed — accounts will be re-imported.

## Glossary

- **Account_Model**: The DynamoDB item representing an account (PK=ACCOUNT#{number}, SK=METADATA) stored in the shop table
- **Import_Mapper**: The field-mapper.ts module that transforms ConsignCloud source records into shop account fields
- **Sync_Process**: The sync-to-shop-table.ts Lambda that reads imported ConsignCloud records and writes or updates accounts in the shop table
- **API_Validator**: The validation.ts module that validates incoming account creation and update requests
- **Frontend_Types**: The TypeScript interfaces in accounts-types.ts that define the account shape for the React frontend
- **Shop_API**: The Lambda-based API that serves account CRUD operations
- **ConsignCloudAccount_Interface**: The TypeScript interface in field-mapper.ts that defines the shape of a source record from ConsignCloud
- **Phone_Normalizer**: The function within the Import_Mapper that strips Swiss country code prefixes from phone numbers
- **Swiss_Mobile_Prefix**: A phone number prefix of `079`, `078`, or `077` indicating a Swiss mobile number

## Requirements

### Requirement 1: Remove address field and add structured address components

**User Story:** As a shop operator, I want address data split into street, place, postcode, and canton fields, so that I can search and filter accounts by location components individually.

#### Acceptance Criteria

1. THE Account_Model SHALL store address data in four separate optional attributes: `street`, `place`, `postcode`, and `canton`
2. THE Account_Model SHALL NOT contain an `address` attribute
3. WHEN an account is created or updated, THE API_Validator SHALL accept `street` as an optional string with a maximum length of 200 characters
4. WHEN an account is created or updated, THE API_Validator SHALL accept `place` as an optional string with a maximum length of 100 characters
5. WHEN an account is created or updated, THE API_Validator SHALL accept `postcode` as an optional string with a maximum length of 20 characters
6. WHEN an account is created or updated, THE API_Validator SHALL accept `canton` as an optional string with a maximum length of 50 characters
7. WHEN an account is listed, THE Shop_API SHALL return `street`, `place`, `postcode`, and `canton` fields in the account response object
8. THE Frontend_Types SHALL define `street`, `place`, `postcode`, and `canton` as optional string properties on the Account interface
9. THE Frontend_Types SHALL NOT include an `address` property on the Account interface

### Requirement 2: Add dedicated email field

**User Story:** As a shop operator, I want a proper email field on accounts, so that email addresses are stored correctly and separately from telephone numbers.

#### Acceptance Criteria

1. THE Account_Model SHALL store email addresses in a dedicated optional `email` attribute
2. WHEN an account is created or updated, THE API_Validator SHALL accept `email` as an optional string with a maximum length of 254 characters
3. WHEN an account is listed, THE Shop_API SHALL return the `email` field in the account response object
4. THE Frontend_Types SHALL define `email` as an optional string property on the Account interface

### Requirement 3: Add dedicated telephone field

**User Story:** As a shop operator, I want the telephone field to contain actual phone numbers, so that contact information is accurate and properly categorized.

#### Acceptance Criteria

1. THE Account_Model SHALL store telephone numbers in the `telephone` attribute
2. WHEN an account is created or updated, THE API_Validator SHALL accept `telephone` as an optional string with a maximum length of 30 characters
3. WHEN an account is listed, THE Shop_API SHALL return the `telephone` field in the account response object
4. THE Frontend_Types SHALL define `telephone` as an optional string property on the Account interface

### Requirement 4: Expand ConsignCloudAccount interface with address and phone fields

**User Story:** As a developer, I want the ConsignCloudAccount interface to include address and phone fields from the source system, so that the import pipeline can map all relevant data.

#### Acceptance Criteria

1. THE ConsignCloudAccount_Interface SHALL include a `phone_number` property typed as an optional string
2. THE ConsignCloudAccount_Interface SHALL include an `address_line_1` property typed as an optional string
3. THE ConsignCloudAccount_Interface SHALL include an `address_line_2` property typed as an optional string
4. THE ConsignCloudAccount_Interface SHALL include a `city` property typed as an optional string
5. THE ConsignCloudAccount_Interface SHALL include a `state` property typed as an optional string
6. THE ConsignCloudAccount_Interface SHALL include a `postal_code` property typed as an optional string

### Requirement 5: Map ConsignCloud address fields to structured account fields

**User Story:** As a shop operator, I want imported accounts to have structured address data from ConsignCloud, so that location information is properly categorized after re-import.

#### Acceptance Criteria

1. WHEN a ConsignCloud account is mapped and both `address_line_1` and `address_line_2` have non-null values, THE Import_Mapper SHALL concatenate them with ", " as separator and assign the result to the `street` field
2. WHEN a ConsignCloud account is mapped and only `address_line_1` has a non-null value, THE Import_Mapper SHALL assign that value directly to the `street` field
3. WHEN a ConsignCloud account is mapped and only `address_line_2` has a non-null value, THE Import_Mapper SHALL assign that value directly to the `street` field
4. WHEN a ConsignCloud account is mapped and both `address_line_1` and `address_line_2` are null, THE Import_Mapper SHALL assign an empty string to the `street` field
5. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL map the source `city` value to the `place` field, defaulting to an empty string when null
6. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL map the source `postal_code` value to the `postcode` field, defaulting to an empty string when null
7. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL map the source `state` value to the `canton` field, defaulting to an empty string when null

### Requirement 6: Map ConsignCloud email to account email field

**User Story:** As a shop operator, I want the ConsignCloud import to map email addresses to the email field, so that re-imported accounts have correct email values.

#### Acceptance Criteria

1. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL map the source `email` value to the `email` field
2. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL NOT map the source `email` value to the `telephone` field

### Requirement 7: Normalize phone numbers during import

**User Story:** As a shop operator, I want imported phone numbers to use the local Swiss format without country code, so that phone numbers are consistent and usable for local communication.

#### Acceptance Criteria

1. WHEN a ConsignCloud account has a `phone_number` starting with `+41`, THE Phone_Normalizer SHALL remove the `+41` prefix and prepend `0` to produce the normalized number
2. WHEN a ConsignCloud account has a `phone_number` starting with `0041`, THE Phone_Normalizer SHALL remove the `0041` prefix and prepend `0` to produce the normalized number
3. WHEN a ConsignCloud account has a `phone_number` that does not start with `+41` or `0041`, THE Phone_Normalizer SHALL keep the phone number unchanged
4. WHEN a ConsignCloud account has a null `phone_number`, THE Phone_Normalizer SHALL produce an empty string
5. WHEN a ConsignCloud account is mapped, THE Import_Mapper SHALL assign the normalized phone number to the `telephone` field

### Requirement 8: Assign tags based on import data

**User Story:** As a shop operator, I want accounts to be automatically tagged based on their notification preferences and phone type, so that I can filter accounts for bulk email or SMS communication.

#### Acceptance Criteria

1. WHEN a ConsignCloud account has `email_notifications_enabled` equal to true, THE Import_Mapper SHALL include the tag `email_notification` in the mapped tags
2. WHEN a ConsignCloud account has `email_notifications_enabled` equal to false, THE Import_Mapper SHALL NOT include the tag `email_notification` in the mapped tags
3. WHEN the normalized telephone number starts with `079`, `078`, or `077`, THE Import_Mapper SHALL include the tag `text_notification` in the mapped tags
4. WHEN the normalized telephone number does not start with `079`, `078`, or `077`, THE Import_Mapper SHALL NOT include the tag `text_notification` in the mapped tags

### Requirement 9: Update sync process for new schema

**User Story:** As a shop operator, I want re-imported accounts to be written with the new field structure and tags, so that all accounts use the updated schema after re-import.

#### Acceptance Criteria

1. WHEN the Sync_Process creates a new account, THE Sync_Process SHALL write `street`, `place`, `postcode`, `canton`, `email`, and `telephone` from the mapped fields to the Account_Model
2. WHEN the Sync_Process creates a new account, THE Sync_Process SHALL NOT write an `address` attribute to the Account_Model
3. WHEN the Sync_Process creates a new account, THE Sync_Process SHALL write the mapped tags to the Account_Model
4. WHEN the Sync_Process updates an existing account, THE Sync_Process SHALL update `street`, `place`, `postcode`, `canton`, `email`, and `telephone` from the mapped fields
5. WHEN the Sync_Process updates an existing account, THE Sync_Process SHALL update the tags from the mapped fields
6. WHEN the Sync_Process compares fields for changes, THE Sync_Process SHALL include `street`, `place`, `postcode`, `canton`, `email`, `telephone`, and `tags` in the comparison

### Requirement 10: Update frontend components for new schema

**User Story:** As a shop operator, I want the account form and table to display the new address fields, email, telephone, and canton, so that I can view and manage the restructured data.

#### Acceptance Criteria

1. THE Frontend_Types SHALL define `street`, `place`, `postcode`, `canton`, `email`, and `telephone` as optional string properties on the CreateAccountRequest interface
2. THE Frontend_Types SHALL NOT include an `address` property on the CreateAccountRequest interface
3. WHEN an account form is displayed, THE account form component SHALL render input fields for `street`, `place`, `postcode`, `canton`, `email`, and `telephone`
4. WHEN an account form is displayed, THE account form component SHALL NOT render an input field for `address`
5. WHEN accounts are displayed in a table, THE accounts table component SHALL display columns for `street`, `place`, `postcode`, `canton`, `email`, and `telephone`
