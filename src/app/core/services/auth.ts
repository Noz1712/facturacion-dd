import { Injectable, inject, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

import { auth } from '../firebase';
import { Notifications } from './notifications';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly provider = new GoogleAuthProvider();
  private readonly notifications = inject(Notifications);
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
    try {
      const credentials = await signInWithPopup(auth, this.provider);
      this.notifications.success('Sesion iniciada correctamente.');
      return credentials;
    } catch {
      this.notifications.error('No se pudo iniciar sesion con Google.');
      throw new Error('login_failed');
    }
  }

  async logout() {
    try {
      await signOut(auth);
      this.notifications.success('Sesion cerrada correctamente.');
    } catch {
      this.notifications.error('No se pudo cerrar sesion.');
      throw new Error('logout_failed');
    }
  }
}
