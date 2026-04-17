export interface Invoice {
  id: string;
  userId: string;
  number: string;
  clientId: string;
  clientName: string;
  clientCode?: string;
  currency: CurrencyCode;
  issueDate: string;
  recurringDay: number;
  items: InvoiceItem[];
  chargeTotal: number;
  costTotal: number;
  margin: number;
  notes?: string;
  createdAt?: string;
}

export interface InvoiceItem {
  name: string;
  charge: number;
  cost: number;
}

export type CurrencyCode = 'NIO' | 'USD';
