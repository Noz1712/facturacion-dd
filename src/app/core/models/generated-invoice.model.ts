import { CurrencyCode, InvoiceItem } from './invoice.model';

export interface GeneratedInvoice {
  id: string;
  userId: string;
  recurrenceId: string;
  recurrenceCode: string;
  clientId: string;
  clientName: string;
  currency: CurrencyCode;
  issueDate: string;
  scheduledDate: string;
  periodKey: string;
  items: InvoiceItem[];
  amount: number;
  status: 'Pendiente' | 'Pagada';
  transactionNumber?: string;
  notes?: string;
  createdAt?: string;
}
