export type BankName = 'LAFISE' | 'BAC' | 'BANPRO' | 'FICOHSA' | 'AVANZ';

export interface BankAccount {
  bank: BankName;
  accountNumber: string;
  holder: string;
  currency: 'NIO' | 'USD';
}

export interface CompanyProfile {
  id: string;
  userId: string;
  name: string;
  manager?: string;
  phone?: string;
  paymentTermDays?: number;
  address: string;
  description: string;
  bankAccounts?: BankAccount[];
}
