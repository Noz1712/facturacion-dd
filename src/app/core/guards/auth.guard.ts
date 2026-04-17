import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from '../services/auth';

export const authGuard = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const user = await auth.waitForInitialSession();

  return user ? true : router.createUrlTree(['/login']);
};

export const guestGuard = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const user = await auth.waitForInitialSession();

  return user ? router.createUrlTree(['/app']) : true;
};
