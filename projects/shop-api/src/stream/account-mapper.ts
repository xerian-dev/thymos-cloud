import {
  normalizeSwissPhone,
  buildStreet,
  deriveImportTags,
} from "../import/field-mapper";

export interface MappedAccount {
  firstName: string;
  lastName: string;
  company: string;
  street: string;
  addressLine2: string;
  place: string;
  postcode: string;
  canton: string;
  email: string;
  telephone: string;
  balance: number;
  defaultSplit: number;
  defaultTerms: string;
  defaultInventoryType: string;
  emailNotificationsEnabled: boolean;
  isVendor: boolean;
  taxExempt: boolean;
  tags: string[];
  accountNumber: number;
  sourceId: string;
  createdAt: string;
  lastSettlement: string;
  lastItemEntered: string;
  lastActivity: string;
  locations: Array<{ id: string; name: string }>;
}

export function mapAccount(raw: Record<string, unknown>): MappedAccount {
  const firstName = typeof raw.first_name === "string" ? raw.first_name : "";
  const lastName = typeof raw.last_name === "string" ? raw.last_name : "";
  const company = typeof raw.company === "string" ? raw.company : "";
  const addressLine1 =
    typeof raw.address_line_1 === "string" ? raw.address_line_1 : "";
  const addressLine2 =
    typeof raw.address_line_2 === "string" ? raw.address_line_2 : "";
  const city = typeof raw.city === "string" ? raw.city : "";
  const postalCode = typeof raw.postal_code === "string" ? raw.postal_code : "";
  const state = typeof raw.state === "string" ? raw.state : "";
  const email = typeof raw.email === "string" ? raw.email : "";
  const phoneNumber =
    typeof raw.phone_number === "string" ? raw.phone_number : undefined;
  const balance = typeof raw.balance === "number" ? raw.balance : 0;
  const consignorSplit =
    typeof raw.consignor_split === "number" ? raw.consignor_split : 0;
  const terms = typeof raw.terms === "string" ? raw.terms : "";
  const inventoryType =
    typeof raw.inventory_type === "string" ? raw.inventory_type : "";
  const emailNotificationsEnabled =
    typeof raw.email_notifications_enabled === "boolean"
      ? raw.email_notifications_enabled
      : false;
  const accountNumber =
    typeof raw.number === "string" ? parseInt(raw.number, 10) : 0;
  const sourceId = typeof raw.id === "string" ? raw.id : "";
  const createdAt = typeof raw.created === "string" ? raw.created : "";

  const telephone = normalizeSwissPhone(phoneNumber);
  const street = buildStreet(addressLine1, addressLine2);
  const tags = deriveImportTags(emailNotificationsEnabled, telephone);

  const lastSettlement =
    typeof raw.last_settlement === "string" ? raw.last_settlement : "";
  const lastItemEntered =
    typeof raw.last_item_entered === "string" ? raw.last_item_entered : "";
  const lastActivity =
    typeof raw.last_activity === "string" ? raw.last_activity : "";
  const locations = Array.isArray(raw.locations)
    ? (raw.locations as Array<{ id: string; name: string }>)
    : [];

  return {
    firstName,
    lastName,
    company,
    street,
    addressLine2,
    place: city,
    postcode: postalCode,
    canton: state,
    email,
    telephone,
    balance,
    defaultSplit: consignorSplit,
    defaultTerms: terms,
    defaultInventoryType: inventoryType,
    emailNotificationsEnabled,
    isVendor: true,
    taxExempt: false,
    tags,
    accountNumber,
    sourceId,
    createdAt,
    lastSettlement,
    lastItemEntered,
    lastActivity,
    locations,
  };
}
