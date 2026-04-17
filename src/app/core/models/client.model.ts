export interface Client {
  id: string;
  userId: string;
  name: string;
  ruc: string;
  address: string;
  manager: string;
  billingEmails: string[];
  createdAt?: string;
  updatedAt?: string;
}
