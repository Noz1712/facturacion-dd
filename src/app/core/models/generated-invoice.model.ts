import { CurrencyCode, InvoiceItem } from './invoice.model';

export interface GeneratedInvoice {
  id: string;
  userId: string;
  invoiceCode?: string;
  isManual?: boolean;
  recurrenceId: string;
  recurrenceCode: string;
  clientId: string;
  clientName: string;
  currency: CurrencyCode;
  issueDate: string;
  dueDate?: string;
  scheduledDate: string;
  periodKey: string;
  items: InvoiceItem[];
  chargeTotal: number;
  costTotal: number;
  margin: number;
  status: 'Pendiente' | 'Pagada';
  transactionNumber?: string;
  notes?: string;
  createdAt?: string;
}
