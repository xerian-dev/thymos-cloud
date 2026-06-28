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
