'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { WORKSPACES, rememberedRole } from '@/lib/roles';
import { SkylinePhoto } from './parts';

const DEVICE_ICON: Record<string, IconName> = {
  dispatcher: 'monitor',
  loader: 'tablet',
  driver: 'phone',
  store: 'phone',
};

/** "Start / Choose your role": pick a workspace, then sign in with that role's own screen. */
export function RoleChooser() {
  const router = useRouter();

  // A device that has signed in before goes straight to its sign-in, unless the user asked to switch.
  useEffect(() => {
    const switching = new URLSearchParams(window.location.search).has('switch');
    const remembered = rememberedRole();
    const target = WORKSPACES.find((w) => w.role === remembered);
    if (!switching && target) router.replace(`/login/${target.slug}`);
  }, [router]);

  return (
    <main className="min-h-screen bg-surface p-4 lg:flex lg:gap-4">
      <section className="relative flex min-h-[420px] flex-col overflow-hidden rounded-hero bg-scrim px-6 py-7 sm:px-10 lg:min-h-[calc(100vh-32px)] lg:w-[540px] lg:shrink-0">
        <SkylinePhoto variant="hero" />
        <nav className="relative flex h-11 items-center gap-3">
          <div className="flex items-center gap-[10px]">
            <img alt="" src="/landing/logo-mark.svg" className="size-[39.6px]" />
            <p className="text-[19px] font-semibold text-white">Waypoint Sync</p>
          </div>
          <div className="flex-1" />
          <Link
            href="/"
            className="flex items-center gap-2 rounded-pill border border-white/30 bg-white/[0.14] py-[10px] pl-[14px] pr-4 text-[14px] font-semibold text-white"
          >
            <span aria-hidden>‹</span>
            Home
          </Link>
        </nav>
        <div className="flex-1" />
        <div className="relative flex flex-col gap-5 pt-16">
          <div className="flex items-center gap-2">
            <span className="size-[9px] rounded-[2px] bg-olive" />
            <p className="text-[14px] font-medium text-white">Sign in</p>
          </div>
          <h1 className="text-[44px] font-medium leading-[1.04] tracking-[-0.03em] text-white sm:text-[56px] lg:text-[64px]">
            Who&apos;s signing in?
          </h1>
          <p className="text-[18px] leading-[1.5] text-white/85">
            One app for the whole delivery day. Pick your role and we&apos;ll take you to the right sign-in.
          </p>
          <p className="flex items-center gap-[10px] rounded-[16px] bg-white/10 py-3 pl-[14px] pr-4 text-[14px] leading-[1.5] text-white/90">
            <span aria-hidden className="text-olive">
              ⓘ
            </span>
            We&apos;ll remember your role on this device, so next time you go straight to your sign-in.
          </p>
        </div>
      </section>

      <section className="flex flex-1 flex-col gap-7 px-2 pb-6 pt-10 sm:px-8 lg:pt-11">
        <div className="flex items-center gap-2">
          <span className="size-[9px] rounded-[2px] bg-olive-ink" />
          <p className="text-[14px] font-medium text-ink">Choose your role</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 className="text-[34px] font-medium tracking-[-0.025em] text-ink sm:text-[44px]">
            Pick your workspace
          </h2>
          <p className="w-[260px] max-w-full text-[15px] leading-[1.5] text-muted">
            Four roles, one app. Your role decides which sign-in you see.
          </p>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {WORKSPACES.map((w) => (
            <Link
              key={w.slug}
              href={`/login/${w.slug}`}
              className={`flex min-h-[260px] flex-col rounded-card p-7 ${w.tint}`}
            >
              <div className={`flex items-center gap-3 ${w.ink}`}>
                <span className="text-[14px] font-semibold">{w.index}</span>
                <span className="text-[12px] font-bold tracking-[0.06em]">{w.eyebrow}</span>
                <span className="flex-1" />
                <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink">
                  <Icon name="arrow-up-right" size={16} />
                </span>
              </div>
              <div className="flex-1" />
              <div className="flex flex-col items-start gap-[10px]">
                <p className="text-[34px] font-medium tracking-[-0.02em] text-ink sm:text-[40px]">{w.title}</p>
                <p className="text-[15px] leading-[1.5] text-slate">{w.blurb}</p>
                <span className="flex items-center gap-[6px] rounded-pill bg-surface py-[6px] pl-[10px] pr-3 text-[13px] font-semibold text-slate">
                  <Icon name={DEVICE_ICON[w.slug] ?? 'phone'} size={16} />
                  {w.device}
                </span>
              </div>
            </Link>
          ))}
          <a
            href="http://127.0.0.1:3099/"
            className="flex min-h-[260px] flex-col rounded-card border border-mist bg-surface p-7"
          >
            <div className="flex items-center gap-3 text-olive-ink">
              <span className="text-[14px] font-semibold">[05]</span>
              <span className="text-[12px] font-bold tracking-[0.06em]">LOCAL CHECK</span>
              <span className="flex-1" />
              <span className="flex size-11 items-center justify-center rounded-full bg-olive text-ink">
                <Icon name="arrow-up-right" size={16} />
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex flex-col items-start gap-[10px]">
              <p className="text-[34px] font-medium tracking-[-0.02em] text-ink sm:text-[40px]">Check</p>
              <p className="text-[15px] leading-[1.5] text-slate">
                Place a store order, or look up trips and logins, without signing in.
              </p>
            </div>
          </a>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="font-medium">Waypoint Sync · Waypoint Group</span>
          <span className="flex-1" />
          <span>Trouble signing in? IT support · 011 234 5678</span>
        </footer>
      </section>
    </main>
  );
}
