import { Injectable, signal } from '@angular/core';
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { firestore } from '../firebase';
import { Client } from '../models/client.model';

@Injectable({
  providedIn: 'root',
})
export class Clients {
  readonly items = signal<Client[]>([]);
  readonly loading = signal(true);

  private unsubscribe?: () => void;

  watchByUser(userId: string) {
    this.unsubscribe?.();
    this.loading.set(true);

    const clientsRef = collection(firestore, 'clients');
    const clientsQuery = query(clientsRef, where('userId', '==', userId));

    this.unsubscribe = onSnapshot(clientsQuery, (snapshot) => {
      const items = snapshot.docs
        .map((clientDoc) => ({
          id: clientDoc.id,
          ...(clientDoc.data() as Omit<Client, 'id'>),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

      this.items.set(items);
      this.loading.set(false);
    });
  }

  stopWatching() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.items.set([]);
    this.loading.set(false);
  }

  async create(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) {
    await addDoc(collection(firestore, 'clients'), {
      ...client,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async update(
    clientId: string,
    client: Omit<Client, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'ruc'> & { ruc?: string | null },
  ) {
    const payload: Record<string, unknown> = {
      ...client,
      updatedAt: serverTimestamp(),
    };

    if (client.ruc === null) {
      payload['ruc'] = deleteField();
    }

    await updateDoc(doc(firestore, 'clients', clientId), payload);
  }

  async remove(clientId: string) {
    await deleteDoc(doc(firestore, 'clients', clientId));
  }
}
