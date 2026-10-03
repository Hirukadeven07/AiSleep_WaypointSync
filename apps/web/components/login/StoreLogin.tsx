'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { rememberedLoginId } from '@/lib/roles';
import {
  CheckRow,
  Field,
  FormError,
  InputBox,
  PasswordInput,
  SkylinePhoto,
  SubmitButton,
  SwitchRole,
  TextInput,
} from './parts';
import { useSignIn } from './useSignIn';

/** Phone screen below 1024px; split brand/sign-in layout from 1024px, as the driver sign-in. */
export function StoreLogin() {
  const { signIn, busy, error, clearError } = useSignIn();
  const [loginId, setLoginId] = useState('');
  useEffect(() => {
    setLoginId((cur) => cur || (rememberedLoginId('store') ?? ''));
  }, []);
  const [secret, setSecret] = useState('');
  const [remember, setRemember] = useState(true);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn({ role: 'store', loginId: loginId.trim(), secret }, remember);
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-primary lg:max-w-none lg:flex-row lg:bg-surface">
      {/* Phone: the photo sits behind the whole screen. */}
      <div className="lg:hidden">
        <SkylinePhoto variant="sheet" />
      </div>

      <header className="relative flex flex-col gap-[14px] px-7 py-16 lg:flex-1 lg:justify-end lg:overflow-hidden lg:pb-14 lg:pl-14 lg:pr-10 lg:pt-10">
        {/* Desktop: the photo fills the brand panel only. */}
        <div className="hidden lg:block">
          <SkylinePhoto variant="sheet" />
        </div>
        <SwitchRole className="absolute right-5 top-14 z-10 bg-surface/90 lg:right-10 lg:top-10" />
        <span className="relative flex size-12 items-center justify-center">
          <img alt="" src="/landing/logo-mark.svg" className="size-[43.2px]" />
        </span>
        <h1 className="relative text-[30px] font-semibold leading-9 text-bg lg:text-[48px] lg:leading-[56px]">
          Sync Store
        </h1>
        <p className="relative text-[14px] leading-[19px] text-sand lg:text-[17px] lg:leading-6">
          Waypoint Sync · for store managers
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="relative flex flex-1 flex-col gap-[18px] rounded-t-[32px] bg-surface px-6 py-7 lg:w-[600px] lg:flex-none lg:justify-center lg:rounded-none lg:px-[90px] lg:py-16"
      >
        <h2 className="text-[24px] font-semibold leading-[30px] text-ink">Sign in to your store</h2>
        <p className="text-[14px] leading-5 text-muted">Track deliveries, place orders and confirm what arrives.</p>

        <Field label="Store email or ID">
          <InputBox tone="tint">
            <TextInput
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value);
                clearError();
              }}
              autoCapitalize="none"
              autoComplete="username"
              required
              className="text-[16px] font-medium"
            />
          </InputBox>
        </Field>

        <Field label="Password">
          <PasswordInput tone="tint" value={secret} onChange={setSecret} />
        </Field>

        <CheckRow checked={remember} onChange={setRemember}>
          <span className="lg:hidden">Remember this phone</span>
          <span className="hidden lg:inline">Remember this computer</span>
        </CheckRow>
        <FormError message={error} />
        <div className="flex-1 lg:hidden" />
        <SubmitButton busy={busy} className="py-[17px] text-[16px]">
          Sign in
        </SubmitButton>
      </form>
    </main>
  );
}
