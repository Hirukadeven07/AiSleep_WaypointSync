'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PHONE_MAX } from '@/components/shell/PhoneColumn';
import { rememberedLoginId } from '@/lib/roles';
import { CheckRow, Field, FormError, InputBox, Keypad, SkylinePhoto, SubmitButton, SwitchRole, TextInput } from './parts';
import { useSignIn } from './useSignIn';

const PIN_LENGTH = 4;

/** Phone screen below 1024px; split brand/sign-in layout from 1024px (Figma "Driver / Login · Desktop"). */
export function DriverLogin() {
  const { signIn, busy, error, clearError } = useSignIn();
  const [loginId, setLoginId] = useState('');
  useEffect(() => {
    setLoginId((cur) => cur || (rememberedLoginId('driver') ?? ''));
  }, []);
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);

  const onDigit = useCallback(
    (d: string) => {
      setPin((p) => (p.length < PIN_LENGTH ? p + d : p));
      clearError();
    },
    [clearError],
  );
  const onBackspace = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn({ role: 'driver', loginId: loginId.trim(), secret: pin }, remember);
  }

  return (
    <main
      className={`relative mx-auto flex min-h-dvh w-full ${PHONE_MAX} flex-col overflow-hidden bg-primary lg:max-w-none lg:flex-row lg:bg-surface`}
    >
      {/* Phone: the photo sits behind the whole screen. */}
      <div className="lg:hidden">
        <SkylinePhoto variant="sheet" />
      </div>

      <header className="relative flex flex-col gap-[14px] px-7 py-14 lg:flex-1 lg:justify-end lg:overflow-hidden lg:pb-14 lg:pl-14 lg:pr-10 lg:pt-10">
        {/* Desktop: the photo fills the brand panel only. */}
        <div className="hidden lg:block">
          <SkylinePhoto variant="sheet" />
        </div>
        <SwitchRole className="absolute right-5 top-14 z-10 bg-surface/90 lg:right-10 lg:top-10" />
        <span className="relative flex size-12 items-center justify-center">
          <img alt="" src="/landing/logo-mark.svg" className="size-[43.2px]" />
        </span>
        <h1 className="relative text-[30px] font-semibold leading-9 text-on-primary lg:text-[48px] lg:leading-[56px]">
          Sync Driver
        </h1>
        <p className="relative text-[14px] leading-[19px] text-sand lg:text-[17px] lg:leading-6">
          Waypoint Sync · for delivery drivers
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="relative flex flex-1 flex-col gap-4 rounded-t-[32px] bg-surface px-6 py-7 lg:w-[600px] lg:flex-none lg:justify-center lg:rounded-none lg:px-[90px] lg:py-16"
      >
        <h2 className="text-[24px] font-semibold leading-[30px] text-ink">Sign in</h2>

        <Field label="Driver ID">
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
              className="text-[17px] font-semibold"
            />
          </InputBox>
        </Field>

        <Field label="Password">
          <div className="flex w-full gap-3" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <span key={i} className="flex h-14 flex-1 items-center justify-center rounded-input bg-bg">
                <span className={`size-3 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-mist'}`} />
              </span>
            ))}
          </div>
        </Field>

        <Keypad onDigit={onDigit} onBackspace={onBackspace} />

        <p className="hidden text-[13px] font-medium leading-[17px] text-muted lg:block">
          Tip: on a laptop you can type your PIN with the keyboard
        </p>

        <CheckRow checked={remember} onChange={setRemember}>
          <span className="lg:hidden">Remember this phone</span>
          <span className="hidden lg:inline">Remember this computer</span>
        </CheckRow>
        <FormError message={error} />
        <SubmitButton
          busy={busy}
          disabled={!loginId.trim() || pin.length < PIN_LENGTH}
          className="py-[17px] text-[16px]"
        >
          Sign in
        </SubmitButton>
      </form>
    </main>
  );
}
