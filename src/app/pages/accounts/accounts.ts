import { Component, computed, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { BankAccount, BankName } from '../../core/models/company-profile.model';
import { Auth } from '../../core/services/auth';
import { CompanyProfileService } from '../../core/services/company-profile';
import { Notifications } from '../../core/services/notifications';

@Component({
  selector: 'app-accounts-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
})
export class AccountsPage {
  private readonly auth = inject(Auth);
  private readonly formBuilder = inject(FormBuilder);
  private readonly companyProfile = inject(CompanyProfileService);
  private readonly notifications = inject(Notifications);

  readonly user = this.auth.user;
  readonly profile = this.companyProfile.item;
  readonly loading = this.companyProfile.loading;
  readonly bankCatalog: BankName[] = ['LAFISE', 'BAC', 'BANPRO', 'FICOHSA', 'AVANZ'];
  readonly bankAccounts = computed(() => this.profile()?.bankAccounts ?? []);

  readonly form = this.formBuilder.nonNullable.group({
    bank: ['LAFISE' as BankName, [Validators.required]],
    accountNumber: ['', [Validators.required]],
    holder: ['', [Validators.required]],
    currency: ['NIO' as BankAccount['currency'], [Validators.required]],
  });

  constructor() {
    const user = this.user();
    if (user) {
      this.companyProfile.watch(user.uid);
    }

    effect(() => {
      this.profile();
      this.form.markAsPristine();
    });
  }

  async addAccount() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.warning('Completa todos los campos de la cuenta bancaria.');
      return;
    }

    const user = this.user();
    if (!user) {
      this.notifications.warning('Debes iniciar sesion para agregar cuentas.');
      return;
    }

    const value = this.form.getRawValue();
    const newAccount: BankAccount = {
      bank: value.bank,
      accountNumber: value.accountNumber.trim(),
      holder: value.holder.trim(),
      currency: value.currency,
    };

    if (!newAccount.accountNumber || !newAccount.holder) {
      this.notifications.warning('Numero de cuenta y titular son obligatorios.');
      return;
    }

    const nextAccounts = [...this.bankAccounts(), newAccount];
    try {
      await this.companyProfile.saveBankAccounts(user.uid, nextAccounts);
    } catch {
      return;
    }

    this.form.reset({
      bank: 'LAFISE',
      accountNumber: '',
      holder: '',
      currency: 'NIO',
    });
  }

  async removeAccount(index: number) {
    const user = this.user();
    if (!user) {
      this.notifications.warning('Debes iniciar sesion para eliminar cuentas.');
      return;
    }

    const nextAccounts = this.bankAccounts().filter((_, currentIndex) => currentIndex !== index);
    try {
      await this.companyProfile.saveBankAccounts(user.uid, nextAccounts);
    } catch {
      return;
    }
  }
}
