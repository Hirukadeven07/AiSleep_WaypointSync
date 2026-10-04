'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
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

const CHIPS = ['Dispatcher', 'Loader', 'Driver', 'Store manager'];

export function DispatcherLogin() {
  const { signIn, busy, error, clearError } = useSignIn();
  const [loginId, setLoginId] = useState('');
  useEffect(() => {
    setLoginId((cur) => cur || (rememberedLoginId('dispatcher') ?? ''));
  }, []);
  const [secret, setSecret] = useState('');
  const [remember, setRemember] = useState(true);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn({ role: 'dispatcher', loginId: loginId.trim(), secret }, remember);
  }

  return (
    <main className="relative min-h-screen bg-bg p-4 lg:flex lg:gap-4">
      <section className="relative flex min-h-[300px] flex-1 flex-col gap-5 overflow-hidden rounded-shell p-8 sm:p-10 lg:min-h-0 lg:w-[calc((100%-16px)*0.5402)] lg:flex-none lg:p-14">
        <SkylinePhoto variant="panel" />
        <div className="relative flex items-center gap-3">
          <img alt="" src="/landing/logo-mark.svg" className="size-[39.6px]" />
          <p className="text-[20px] font-semibold text-on-primary">Waypoint Sync</p>
        </div>
        <div className="flex-1" />
        <h2 className="relative text-[36px] font-medium leading-[1.1] text-on-primary sm:text-[44px] lg:text-[56px] lg:leading-[62px]">
          One plan.
          <br />
          Every role in sync.
        </h2>
        <p className="relative text-[16px] leading-6 text-sand">
          Plan trips, load in the right order, deliver with proof, and keep every store informed, all from one
          connected system.
        </p>
        <div className="relative flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <span
              key={c}
              className="rounded-pill border border-slate px-[14px] py-[7px] text-[13px] font-medium text-on-primary"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      <section className="relative flex flex-1 items-center justify-center px-2 py-12 lg:py-0">
        <SwitchRole className="absolute right-2 top-4 border border-mist bg-surface lg:right-6 lg:top-6" />
        <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-[18px]">
          <h1 className="text-[36px] font-medium leading-[42px] text-ink">Welcome back</h1>
          <p className="text-[15px] leading-[22px] text-muted">
            Sign in to the Waypoint Sync Console with your employee ID or work email.
          </p>
          <Field label="Employee ID or email">
            <InputBox tone="card">
              <TextInput
                value={loginId}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  clearError();
                }}
                autoCapitalize="none"
                autoComplete="username"
                required
              />
            </InputBox>
          </Field>
          <Field label="Password" trailing={<span className="font-semibold text-slate">Forgot password?</span>}>
            <PasswordInput tone="card" value={secret} onChange={setSecret} />
          </Field>
          <CheckRow checked={remember} onChange={setRemember} size={20}>
            Keep me signed in on this computer
          </CheckRow>
          <FormError message={error} />
          <SubmitButton busy={busy} className="py-[14px] leading-[21px]">
            Sign in
          </SubmitButton>
          <div className="flex gap-3 rounded-note bg-info-tint p-[14px]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-slate">
              <Icon name="phone" size={16} />
            </span>
            <p className="flex-1 text-label font-normal leading-[19px] text-muted">
              Not a dispatcher? Use Switch role to sign in as a loader, driver or store manager. It&apos;s all one
              app.
            </p>
          </div>
          <p className="text-caption leading-[17px] text-muted">
            Trouble signing in? Contact IT support · 011 234 5678
          </p>
        </form>
      </section>
    </main>
  );
}
