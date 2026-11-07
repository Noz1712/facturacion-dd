import { Injectable, inject, signal } from '@angular/core';
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
import { Notifications } from './notifications';
import { toLocalIsoDate, toPeriodKey } from '../utils/recurrence-schedule';

@Injectable({
  providedIn: 'root',
})
export class GeneratedInvoices {
  readonly items = signal<GeneratedInvoice[]>([]);
  readonly loading = signal(true);
  private readonly notifications = inject(Notifications);

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
    const periodKey = toPeriodKey(scheduledDate);
    const alreadyGenerated = this.items().some(
      (item) => item.recurrenceId === recurrence.id && item.periodKey === periodKey,
    );

    if (alreadyGenerated) {
      this.notifications.warning('Esta factura ya fue generada para el periodo seleccionado.');
      return;
    }

    const today = toLocalIsoDate(new Date());
    const dueDate = this.addDaysToIso(today, paymentTermDays);
    const invoiceCode = this.buildInvoiceCode(recurrence.clientCode, recurrence.clientId);
    const chargeTotal = this.getChargeTotal(recurrence);
    const costTotal = this.getCostTotal(recurrence);
    const margin = chargeTotal - costTotal;

    try {
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
        scheduledDate: toLocalIsoDate(scheduledDate),
        periodKey,
        items: recurrence.items,
        chargeTotal,
        costTotal,
        margin,
        status: 'Pendiente',
        transactionNumber: '',
        notes: recurrence.notes ?? '',
      });
      this.notifications.success('Factura generada correctamente.');
    } catch {
      this.notifications.error('No se pudo generar la factura.');
      throw new Error('generate_invoice_failed');
    }
  }

  async updatePayment(
    invoiceId: string,
    status: GeneratedInvoice['status'],
    transactionNumber: string,
  ) {
    try {
      await updateDoc(doc(firestore, 'generatedInvoices', invoiceId), {
        status,
        transactionNumber: transactionNumber.trim(),
      });
      this.notifications.success('Pago actualizado correctamente.');
    } catch {
      this.notifications.error('No se pudo actualizar el pago.');
      throw new Error('update_payment_failed');
    }
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

    try {
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
      this.notifications.success('Factura manual registrada correctamente.');
    } catch {
      this.notifications.error('No se pudo registrar la factura manual.');
      throw new Error('create_manual_invoice_failed');
    }
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

    try {
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
      this.notifications.success('Factura manual actualizada correctamente.');
    } catch {
      this.notifications.error('No se pudo actualizar la factura manual.');
      throw new Error('update_manual_invoice_failed');
    }
  }

  async revert(invoiceId: string) {
    try {
      await deleteDoc(doc(firestore, 'generatedInvoices', invoiceId));
      this.notifications.success('Factura revertida correctamente.');
    } catch {
      this.notifications.error('No se pudo revertir la factura.');
      throw new Error('revert_invoice_failed');
    }
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
