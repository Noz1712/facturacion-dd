import { Injectable, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { firestore } from '../firebase';
import { GeneratedInvoice } from '../models/generated-invoice.model';
import { Invoice } from '../models/invoice.model';

@Injectable({
  providedIn: 'root',
})
export class GeneratedInvoices {
  readonly items = signal<GeneratedInvoice[]>([]);
  readonly loading = signal(true);

  private unsubscribe?: () => void;

  watchByUser(userId: string) {
    this.unsubscribe?.();
    this.loading.set(true);

    const generatedRef = collection(firestore, 'generatedInvoices');
    const generatedQuery = query(
      generatedRef,
      where('userId', '==', userId),
      orderBy('issueDate', 'desc'),
    );

    this.unsubscribe = onSnapshot(generatedQuery, (snapshot) => {
      this.items.set(
        snapshot.docs.map((generatedDoc) => ({
          id: generatedDoc.id,
          ...(generatedDoc.data() as Omit<GeneratedInvoice, 'id'>),
        })),
      );
      this.loading.set(false);
    });
  }

  stopWatching() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.items.set([]);
    this.loading.set(false);
  }

  async generateNow(recurrence: Invoice, scheduledDate: Date, paymentTermDays = 0) {
    const periodKey = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}`;
    const alreadyGenerated = this.items().some(
      (item) => item.recurrenceId === recurrence.id && item.periodKey === periodKey,
    );

    if (alreadyGenerated) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = this.addDaysToIso(today, paymentTermDays);
    const invoiceCode = this.buildInvoiceCode(recurrence.clientCode, recurrence.clientId);
    const chargeTotal = this.getChargeTotal(recurrence);
    const costTotal = this.getCostTotal(recurrence);
    const margin = chargeTotal - costTotal;

    await addDoc(collection(firestore, 'generatedInvoices'), {
      userId: recurrence.userId,
      invoiceCode,
      recurrenceId: recurrence.id,
      recurrenceCode: recurrence.number,
      clientId: recurrence.clientId,
      clientName: recurrence.clientName,
      currency: recurrence.currency,
      issueDate: today,
      dueDate,
      scheduledDate: scheduledDate.toISOString().slice(0, 10),
      periodKey,
      items: recurrence.items,
      chargeTotal,
      costTotal,
      margin,
      status: 'Pendiente',
      transactionNumber: '',
      notes: recurrence.notes ?? '',
    });
  }

  async updatePayment(
    invoiceId: string,
    status: GeneratedInvoice['status'],
    transactionNumber: string,
  ) {
    await updateDoc(doc(firestore, 'generatedInvoices', invoiceId), {
      status,
      transactionNumber: transactionNumber.trim(),
    });
  }

  async createManual(payload: {
    userId: string;
    clientId: string;
    clientName: string;
    clientCode?: string;
    currency: GeneratedInvoice['currency'];
    issueDate: string;
    dueDate: string;
    items: GeneratedInvoice['items'];
    notes?: string;
  }) {
    const chargeTotal = payload.items.reduce((sum, item) => sum + Number(item.charge || 0), 0);
    const costTotal = payload.items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const margin = chargeTotal - costTotal;
    const invoiceCode = this.buildInvoiceCode(payload.clientCode, payload.clientId);

    await addDoc(collection(firestore, 'generatedInvoices'), {
      userId: payload.userId,
      invoiceCode,
      isManual: true,
      recurrenceId: 'manual',
      recurrenceCode: 'MANUAL',
      clientId: payload.clientId,
      clientName: payload.clientName,
      currency: payload.currency,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      scheduledDate: payload.issueDate,
      periodKey: payload.issueDate.slice(0, 7),
      items: payload.items,
      chargeTotal,
      costTotal,
      margin,
      status: 'Pendiente',
      transactionNumber: '',
      notes: payload.notes ?? '',
    });
  }

  async updateManual(
    invoiceId: string,
    payload: {
      clientId: string;
      clientName: string;
      clientCode?: string;
      currency: GeneratedInvoice['currency'];
      issueDate: string;
      dueDate: string;
      items: GeneratedInvoice['items'];
      notes?: string;
    },
  ) {
    const chargeTotal = payload.items.reduce((sum, item) => sum + Number(item.charge || 0), 0);
    const costTotal = payload.items.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const margin = chargeTotal - costTotal;
    const invoiceCode = this.buildInvoiceCode(payload.clientCode, payload.clientId);

    await updateDoc(doc(firestore, 'generatedInvoices', invoiceId), {
      invoiceCode,
      isManual: true,
      recurrenceId: 'manual',
      recurrenceCode: 'MANUAL',
      clientId: payload.clientId,
      clientName: payload.clientName,
      currency: payload.currency,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate,
      scheduledDate: payload.issueDate,
      periodKey: payload.issueDate.slice(0, 7),
      items: payload.items,
      chargeTotal,
      costTotal,
      margin,
      notes: payload.notes ?? '',
    });
  }

  async revert(invoiceId: string) {
    await deleteDoc(doc(firestore, 'generatedInvoices', invoiceId));
  }

  private getChargeTotal(recurrence: Invoice) {
    if (typeof recurrence.chargeTotal === 'number') {
      return recurrence.chargeTotal;
    }

    const legacyAmount = (recurrence as Invoice & { amount?: number }).amount;
    if (typeof legacyAmount === 'number') {
      return legacyAmount;
    }

    return 0;
  }

  private getCostTotal(recurrence: Invoice) {
    if (typeof recurrence.costTotal === 'number') {
      return recurrence.costTotal;
    }

    return 0;
  }

  private buildInvoiceCode(clientCode: string | undefined, clientId: string) {
    const safeClientCode = this.getClientCode(clientCode, clientId);
    const sequence = this.getClientSequence(clientId);
    return `${safeClientCode}${sequence}`;
  }

  private getClientCode(clientCode: string | undefined, clientId: string) {
    const normalized = (clientCode?.trim() || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const shortCode = normalized.slice(0, 6);
    return shortCode || 'CLIENT';
  }

  private getClientSequence(clientId: string) {
    const count = this.items().filter((item) => item.clientId === clientId).length;
    return String(count + 1).padStart(5, '0');
  }

  private addDaysToIso(issueDate: string, days: number) {
    const parsed = new Date(`${issueDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return issueDate;
    }

    const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
    parsed.setDate(parsed.getDate() + safeDays);
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
