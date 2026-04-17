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

  async generateNow(recurrence: Invoice, scheduledDate: Date) {
    const periodKey = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, '0')}`;
    const alreadyGenerated = this.items().some(
      (item) => item.recurrenceId === recurrence.id && item.periodKey === periodKey,
    );

    if (alreadyGenerated) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    await addDoc(collection(firestore, 'generatedInvoices'), {
      userId: recurrence.userId,
      recurrenceId: recurrence.id,
      recurrenceCode: recurrence.number,
      clientId: recurrence.clientId,
      clientName: recurrence.clientName,
      currency: recurrence.currency,
      issueDate: today,
      scheduledDate: scheduledDate.toISOString().slice(0, 10),
      periodKey,
      items: recurrence.items,
      amount: recurrence.amount,
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

  async revert(invoiceId: string) {
    await deleteDoc(doc(firestore, 'generatedInvoices', invoiceId));
  }
}
