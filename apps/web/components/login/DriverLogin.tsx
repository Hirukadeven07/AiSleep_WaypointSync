'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rememberedLoginId } from '@/lib/roles';
import { CheckRow, Field, FormError, InputBox, Keypad, SkylinePhoto, SubmitButton, SwitchRole, TextInput } from './parts';
import { useSignIn } from './useSignIn';

const PIN_LENGTH = 4;

export function DriverLogin() {
  const { signIn, busy, error, clearError } = useSignIn();
  const [loginId, setLoginId] = useState('');
  useEffect(() => {
    setLoginId((cur) => cur || (rememberedLoginId('driver') ?? ''));
  }, []);
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);

  const onDigit = useCallback((d: string) => {
    setPin((p) => (p.length < PIN_LENGTH ? p + d : p));
    clearError();
  }, [clearError]);
  const onBackspace = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn({ role: 'driver', loginId: loginId.trim(), secret: pin }, remember);
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-hidden bg-primary">
      <SkylinePhoto variant="sheet" />
      <SwitchRole className="absolute right-5 top-14 z-10 bg-surface/90" />

      <header className="relative flex flex-col gap-[14px] px-7 py-14">
        <span className="flex size-12 items-center justify-center">
          <img alt="" src="/landing/logo-mark.svg" className="size-[43.2px]" />
        </span>
        <h1 className="text-[30px] font-semibold leading-9 text-bg">Sync Driver</h1>
        <p className="text-[14px] leading-[19px] text-sand">Waypoint Sync · for delivery drivers</p>
      </header>

      <form onSubmit={onSubmit} className="relative flex flex-1 flex-col gap-4 rounded-t-[32px] bg-surface px-6 py-7">
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

        <CheckRow checked={remember} onChange={setRemember}>
          Remember this phone
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
