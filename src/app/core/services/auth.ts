import { Injectable, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

import { auth } from '../firebase';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly provider = new GoogleAuthProvider();
  private initialSessionPromise: Promise<User | null>;

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);

  constructor() {
    this.initialSessionPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        this.user.set(user);
        this.loading.set(false);
        resolve(user);
        unsubscribe();
      });
    });

    onAuthStateChanged(auth, (user) => {
      this.user.set(user);
      this.loading.set(false);
    });
  }

  waitForInitialSession() {
    return this.initialSessionPromise;
  }

  async signInWithGoogle() {
    return signInWithPopup(auth, this.provider);
  }

  async logout() {
    await signOut(auth);
  }
}
