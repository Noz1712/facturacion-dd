import { Injectable, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

import { auth } from '../firebase';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly provider = new GoogleAuthProvider();
  private authReadyPromise: Promise<void>;

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);

  constructor() {
    this.authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        this.user.set(user);
        this.loading.set(false);
        resolve();
        unsubscribe();
      });
    });

    onAuthStateChanged(auth, (user) => {
      this.user.set(user);
      this.loading.set(false);
    });
  }

  waitForInitialSession() {
    return this.authReadyPromise;
  }

  async signInWithGoogle() {
    return signInWithPopup(auth, this.provider);
  }

  async logout() {
    await signOut(auth);
  }
}
