'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useDriver } from '@/components/drive/DriverShell';
import { AuthError, login } from '@/lib/driver-api';

export default function DriverLogin() {
  const router = useRouter();
  const { refresh } = useDriver();
  const [loginId, setLoginId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(loginId.trim(), secret);
      await refresh();
      router.replace('/drive');
    } catch (err) {
      setError(
        err instanceof AuthError
          ? 'Wrong ID or PIN. Check both and try again.'
          : "Can't reach the server. Check your signal and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 h-14 w-full rounded-xl border-2 border-neutral-300 bg-white px-4 text-lg focus:border-black focus:outline-none';

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Sync Driver</h1>
      <label className="block text-base font-semibold">
        Driver ID
        <input className={field} value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" required />
      </label>
      <label className="block text-base font-semibold">
        PIN
        <input className={field} value={secret} onChange={(e) => setSecret(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" required />
      </label>
      {error && <p role="alert" className="text-base font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="h-14 rounded-xl bg-black text-lg font-bold text-white disabled:opacity-60">
        {busy ? 'Signing in' : 'Sign in'}
      </button>
    </form>
  );
}
