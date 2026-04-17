export interface Invoice {
  id: string;
  userId: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: CurrencyCode;
  issueDate: string;
  recurringDay: number;
  items: InvoiceItem[];
  amount: number;
  notes?: string;
  createdAt?: string;
}

export interface InvoiceItem {
  name: string;
  amount: number;
}

export type CurrencyCode = 'NIO' | 'USD';
