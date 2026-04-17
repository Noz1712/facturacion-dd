import { Injectable, inject, signal } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';

import { firestore } from '../firebase';
import { Invoice } from '../models/invoice.model';
import { Notifications } from './notifications';

@Injectable({
  providedIn: 'root',
})
export class Invoices {
  readonly items = signal<Invoice[]>([]);
  readonly loading = signal(true);
  private readonly notifications = inject(Notifications);

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
    try {
      await addDoc(collection(firestore, 'invoices'), {
        ...invoice,
        number: invoice.number?.trim() || this.generateRecurrenceCode(),
        createdAt: serverTimestamp(),
      });
      this.notifications.success('Recurrencia guardada correctamente.');
    } catch {
      this.notifications.error('No se pudo guardar la recurrencia.');
      throw new Error('create_recurrence_failed');
    }
  }

  async update(
    invoiceId: string,
    invoice: Omit<Invoice, 'id' | 'userId' | 'createdAt' | 'number'>,
  ) {
    try {
      await updateDoc(doc(firestore, 'invoices', invoiceId), {
        ...invoice,
        updatedAt: serverTimestamp(),
      });
      this.notifications.success('Recurrencia actualizada correctamente.');
    } catch {
      this.notifications.error('No se pudo actualizar la recurrencia.');
      throw new Error('update_recurrence_failed');
    }
  }

  async remove(invoiceId: string) {
    try {
      await deleteDoc(doc(firestore, 'invoices', invoiceId));
      this.notifications.success('Recurrencia eliminada correctamente.');
    } catch {
      this.notifications.error('No se pudo eliminar la recurrencia.');
      throw new Error('delete_recurrence_failed');
    }
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
