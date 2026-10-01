'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { rememberedLoginId } from '@/lib/roles';
import {
  CheckRow,
  Field,
  FormError,
  InputBox,
  Keypad,
  SkylinePhoto,
  SubmitButton,
  SwitchRole,
  TextInput,
} from './parts';
import { useSignIn } from './useSignIn';

const DEPOTS = ['Peliyagoda', 'Kandy'];
const CODE_LENGTH = 6;

export function LoaderLogin() {
  const { signIn, busy, error, clearError } = useSignIn();
  const [depotId, setDepotId] = useState(DEPOTS[0]!);
  const [loginId, setLoginId] = useState('');
  useEffect(() => {
    setLoginId((cur) => cur || (rememberedLoginId('loader') ?? ''));
  }, []);
  const [code, setCode] = useState('');
  const [keep, setKeep] = useState(true);

  const onDigit = useCallback((d: string) => setCode((c) => (c.length < CODE_LENGTH ? c + d : c)), []);
  const onBackspace = useCallback(() => setCode((c) => c.slice(0, -1)), []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // The API identifies a loader by id and depot. The dock password is sent along so the
    // server can start enforcing it without another client change.
    void signIn({ role: 'loader', loginId: loginId.trim(), depotId, ...(code ? { secret: code } : {}) }, keep);
  }

  return (
    <main className="relative min-h-screen bg-bg md:flex">
      <section className="relative flex min-h-[260px] flex-1 flex-col gap-4 overflow-hidden p-8 sm:p-12 md:min-h-screen">
        <SkylinePhoto variant="panel" />
        <div className="relative flex items-center gap-3">
          <img alt="" src="/landing/logo-mark.svg" className="size-[39.6px]" />
          <p className="text-[20px] font-semibold text-bg">Waypoint Sync</p>
        </div>
        <div className="flex-1" />
        <h2 className="relative text-[32px] font-semibold leading-[1.15] text-bg md:text-[40px] md:leading-[46px]">
          Dock login
        </h2>
        <p className="relative text-[15px] leading-[22px] text-sand">
          Shared tablet at the loading dock. Everyone on the loader team knows this password.
        </p>
        <div className="relative">
          <span className="inline-flex rounded-pill border border-slate px-4 py-2 text-[13px] font-medium text-bg">
            Loader
          </span>
        </div>
      </section>

      <section className="relative flex flex-1 items-center justify-center bg-surface px-6 py-14 sm:p-12">
        <SwitchRole className="absolute right-6 top-6 border border-mist bg-surface md:right-10 md:top-8" />
        <form onSubmit={onSubmit} className="flex w-full max-w-[420px] flex-col gap-[14px]">
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Unlock this dock</h1>

          <Field label="Depot">
            <div className="flex w-full gap-[10px]" role="radiogroup" aria-label="Depot">
              {DEPOTS.map((d) => {
                const on = d === depotId;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDepotId(d)}
                    className={`flex flex-1 items-center gap-[10px] rounded-note px-[14px] py-3 text-left ${
                      on ? 'border-2 border-slate bg-info-tint' : 'border-2 border-transparent bg-bg'
                    }`}
                  >
                    <Icon name="pin" size={18} className="text-slate" />
                    <span className="text-[15px] font-bold text-ink">{d}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Loader ID">
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

          <Field label="Dock password">
            <div
              aria-label={`${code.length} of ${CODE_LENGTH} digits entered`}
              className="flex w-full items-center gap-[10px] rounded-note bg-bg px-[18px] py-[13px]"
            >
              <span className="text-[24px] font-bold leading-[30px] tracking-[0.05em] text-ink">
                {'•'.repeat(code.length)}
              </span>
              <span aria-hidden className="h-6 w-0.5 bg-slate" />
            </div>
          </Field>

          <Keypad onDigit={onDigit} onBackspace={onBackspace} />

          <CheckRow checked={keep} onChange={setKeep}>
            Keep this dock unlocked for the shift
          </CheckRow>
          <FormError message={error} />
          <SubmitButton busy={busy} disabled={!loginId.trim()} busyLabel="Unlocking…" className="py-[15px] text-[16px]">
            Unlock dock
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
