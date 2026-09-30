'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginRequest, LoginResponse, Role } from '@waypoint/contracts';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';

const ROLES: { role: Role; label: string; secret: string | null }[] = [
  { role: 'dispatcher', label: 'Dispatcher', secret: 'Password' },
  { role: 'loader', label: 'Loader', secret: null },
  { role: 'driver', label: 'Driver', secret: 'PIN' },
  { role: 'store', label: 'Store manager', secret: 'Password' },
];

const DEPOTS = ['Peliyagoda', 'Kandy'];

const inputClass =
  'w-full rounded-card border border-border bg-bg px-md py-sm text-body text-text placeholder:text-muted';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('dispatcher');
  const [loginId, setLoginId] = useState('');
  const [secret, setSecret] = useState('');
  const [depotId, setDepotId] = useState(DEPOTS[0]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const current = ROLES.find((r) => r.role === role)!;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const body: LoginRequest = {
      role,
      loginId,
      ...(current.secret ? { secret } : {}),
      ...(role === 'loader' ? { depotId } : {}),
    };
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body });
      router.push(res.home);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Invalid login details.' : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-lg p-md">
      <div>
        <h1 className="text-heading font-semibold text-primary">Waypoint Sync</h1>
        <p className="text-label text-muted">Choose your role and sign in.</p>
      </div>

      <div role="tablist" className="grid grid-cols-2 gap-sm">
        {ROLES.map((r) => (
          <button
            key={r.role}
            role="tab"
            aria-selected={role === r.role}
            type="button"
            onClick={() => {
              setRole(r.role);
              setSecret('');
              setError(undefined);
            }}
            className={`min-h-[44px] rounded-card border px-md py-sm text-label font-semibold ${
              role === r.role ? 'border-primary text-primary' : 'border-border text-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-md">
        {role === 'loader' && (
          <label className="block space-y-xs text-label">
            <span className="text-muted">Depot</span>
            <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className={inputClass}>
              {DEPOTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-xs text-label">
          <span className="text-muted">Login ID</span>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
            className={inputClass}
          />
        </label>
        {current.secret && (
          <label className="block space-y-xs text-label">
            <span className="text-muted">{current.secret}</span>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              inputMode={role === 'driver' ? 'numeric' : undefined}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </label>
        )}
        {error && <p className="text-label text-danger">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
