export interface ConsignCloudAccount {
  id: string;
  number: string;
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  balance: number;
  email_notifications_enabled: boolean;
  created: string;
  deleted?: string;
}

export interface MappedAccountFields {
  name: string;
  company: string;
  telephone: string;
}

export function mapConsignCloudToShop(
  source: ConsignCloudAccount,
): MappedAccountFields {
  const name: string = `${source.first_name} ${source.last_name}`.trim();

  return {
    name,
    company: source.company,
    telephone: source.email,
  };
}

export function hasFieldChanges(
  existing: { name: string; company?: string; telephone: string },
  mapped: MappedAccountFields,
): boolean {
  return (
    existing.name !== mapped.name ||
    (existing.company ?? "") !== mapped.company ||
    existing.telephone !== mapped.telephone
  );
}
