export interface Client {
  id: string;
  userId: string;
  name: string;
  clientCode?: string;
  ruc?: string;
  phone: string;
  address: string;
  manager: string;
  billingEmails: string[];
  createdAt?: string;
  updatedAt?: string;
}
