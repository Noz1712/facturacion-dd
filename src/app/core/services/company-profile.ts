import { Injectable, signal } from '@angular/core';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { firestore } from '../firebase';
import { BankAccount } from '../models/company-profile.model';
import { CompanyProfile } from '../models/company-profile.model';

@Injectable({
  providedIn: 'root',
})
export class CompanyProfileService {
  readonly item = signal<CompanyProfile | null>(null);
  readonly loading = signal(true);

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
    await setDoc(doc(firestore, 'companyProfiles', profile.userId), profile, { merge: true });
  }

  async saveBankAccounts(userId: string, bankAccounts: BankAccount[]) {
    await setDoc(
      doc(firestore, 'companyProfiles', userId),
      {
        userId,
        bankAccounts,
      },
      { merge: true },
    );
  }
}
