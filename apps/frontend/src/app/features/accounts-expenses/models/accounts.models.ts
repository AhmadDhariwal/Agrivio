export type AccountType = 'cash' | 'bank' | 'jazzcash' | 'easypaisa';
export type EntityStatus = 'active' | 'inactive' | string;

export interface AccountRecord {
  id: string;
  organizationId: string;
  accountType: AccountType | string;
  name: string;
  bankName: string;
  accountNumberMasked: string;
  walletIdentifier: string;
  status: EntityStatus;
  version: number;
}
