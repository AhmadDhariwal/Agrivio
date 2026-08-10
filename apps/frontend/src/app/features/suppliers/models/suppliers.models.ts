export type EntityStatus = 'active' | 'inactive' | string;

export interface SupplierRecord {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  contactName: string;
  email: string;
  status: EntityStatus;
  version: number;
}
