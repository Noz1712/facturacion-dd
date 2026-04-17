import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Auth } from '../../core/services/auth';
import { CompanyProfileService } from '../../core/services/company-profile';

@Component({
  selector: 'app-profile-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage {
  private readonly auth = inject(Auth);
  private readonly formBuilder = inject(FormBuilder);
  private readonly companyProfile = inject(CompanyProfileService);

  readonly user = this.auth.user;
  readonly profile = this.companyProfile.item;
  readonly loading = this.companyProfile.loading;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    manager: [''],
    phone: [''],
    paymentTermDays: [0, [Validators.required, Validators.min(0)]],
    address: ['', [Validators.required]],
    description: [''],
  });

  constructor() {
    const user = this.user();
    if (user) {
      this.companyProfile.watch(user.uid);
    }

    effect(() => {
      const profile = this.profile();

      this.form.patchValue({
        name: profile?.name ?? '',
        manager: profile?.manager ?? '',
        phone: profile?.phone ?? '',
        paymentTermDays: profile?.paymentTermDays ?? 0,
        address: profile?.address ?? '',
        description: profile?.description ?? '',
      });

      this.form.markAsPristine();
    });
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.user();
    if (!user) {
      return;
    }

    const value = this.form.getRawValue();
    const currentBankAccounts = this.profile()?.bankAccounts ?? [];
    const paymentTermDays = Math.max(0, Math.floor(Number(value.paymentTermDays) || 0));

    await this.companyProfile.save({
      userId: user.uid,
      name: value.name.trim(),
      manager: value.manager.trim(),
      phone: value.phone.trim(),
      paymentTermDays,
      address: value.address.trim(),
      description: value.description.trim(),
      bankAccounts: currentBankAccounts,
    });
  }
}
