import { Injectable, inject, signal } from '@angular/core';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { firestore } from '../firebase';
import { BankAccount } from '../models/company-profile.model';
import { CompanyProfile } from '../models/company-profile.model';
import { Notifications } from './notifications';

@Injectable({
  providedIn: 'root',
})
export class CompanyProfileService {
  readonly item = signal<CompanyProfile | null>(null);
  readonly loading = signal(true);
  private readonly notifications = inject(Notifications);

  private unsubscribe?: () => void;

  watch(userId: string) {
    this.unsubscribe?.();
    this.loading.set(true);

    const profileRef = doc(firestore, 'companyProfiles', userId);
    this.unsubscribe = onSnapshot(profileRef, (snapshot) => {
      this.item.set(
        snapshot.exists()
          ? ({ id: snapshot.id, ...(snapshot.data() as Omit<CompanyProfile, 'id'>) })
          : null,
      );
      this.loading.set(false);
    });
  }

  stopWatching() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.item.set(null);
    this.loading.set(false);
  }

  async save(profile: Omit<CompanyProfile, 'id'>) {
    try {
      await setDoc(doc(firestore, 'companyProfiles', profile.userId), profile, { merge: true });
      this.notifications.success('Perfil de empresa guardado correctamente.');
    } catch {
      this.notifications.error('No se pudo guardar el perfil de empresa.');
      throw new Error('save_company_profile_failed');
    }
  }

  async saveBankAccounts(userId: string, bankAccounts: BankAccount[]) {
    try {
      await setDoc(
        doc(firestore, 'companyProfiles', userId),
        {
          userId,
          bankAccounts,
        },
        { merge: true },
      );
      this.notifications.success('Cuentas bancarias actualizadas correctamente.');
    } catch {
      this.notifications.error('No se pudieron actualizar las cuentas bancarias.');
      throw new Error('save_bank_accounts_failed');
    }
  }
}
