import { Injectable, signal } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';

import { firestore } from '../firebase';
import { Invoice } from '../models/invoice.model';

@Injectable({
  providedIn: 'root',
})
export class Invoices {
  readonly items = signal<Invoice[]>([]);
  readonly loading = signal(true);

  private unsubscribe?: () => void;

  watchByUser(userId: string) {
    this.unsubscribe?.();
    this.loading.set(true);

    const invoicesRef = collection(firestore, 'invoices');
    const invoicesQuery = query(
      invoicesRef,
      where('userId', '==', userId),
      orderBy('issueDate', 'desc'),
    );

    this.unsubscribe = onSnapshot(invoicesQuery, (snapshot) => {
      this.items.set(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Invoice, 'id'>),
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

  async create(invoice: Omit<Invoice, 'id' | 'createdAt' | 'number'> & { number?: string }) {
    await addDoc(collection(firestore, 'invoices'), {
      ...invoice,
      number: invoice.number?.trim() || this.generateRecurrenceCode(),
      createdAt: serverTimestamp(),
    });
  }

  async update(
    invoiceId: string,
    invoice: Omit<Invoice, 'id' | 'userId' | 'createdAt' | 'number'>,
  ) {
    await updateDoc(doc(firestore, 'invoices', invoiceId), {
      ...invoice,
      updatedAt: serverTimestamp(),
    });
  }

  async remove(invoiceId: string) {
    await deleteDoc(doc(firestore, 'invoices', invoiceId));
  }

  private generateRecurrenceCode() {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    return `REC-${stamp}`;
  }
}
