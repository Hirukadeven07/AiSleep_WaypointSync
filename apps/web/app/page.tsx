import Link from 'next/link';
import { SignedInRedirect } from '@/components/landing/SignedInRedirect';

// Landing page from the Day 5 Figma ("Start / Landing", node 666:2).
// Images live in /public/landing (downloaded from Figma; the Figma asset URLs expire).

const A = '/landing';

function Eyebrow({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-[9px] rounded-[2px] ${dark ? 'bg-olive' : 'bg-olive-ink'}`} />
      <p className={`text-[14px] font-medium ${dark ? 'text-white' : 'text-ink'}`}>{children}</p>
    </div>
  );
}

function Arrow({ size = 14, src = 'arrow-up-right.svg' }: { size?: number; src?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" src={`${A}/${src}`} width={size} height={size} className="shrink-0" />;
}

function PillLink({
  href,
  tone,
  children,
}: {
  href: string;
  tone: 'white' | 'olive';
  children: string;
}) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-5 py-3 text-[15px] font-semibold text-ink ${
        tone === 'white' ? 'bg-white' : 'bg-olive'
      }`}
    >
      {children}
      <Arrow />
    </Link>
  );
}

function PhotoShade({ top }: { top: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src={`${A}/photo.webp`}
        className="pointer-events-none absolute inset-0 size-full max-w-none object-cover blur-[7px] lg:inset-auto lg:left-[-36px] lg:top-[var(--t)] lg:h-[720px] lg:w-[1480px]"
        style={{ '--t': `${top}px` } as React.CSSProperties}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/[0.94] via-ink/70 via-[55%] to-ink/45" />
    </>
  );
}

const STORES = [
  'text-[22px] font-bold',
  'text-[22px] font-semibold tracking-[-0.44px]',
  'text-[21px] font-medium tracking-[1.26px]',
  'text-[21px] font-normal',
  'text-[21px] font-bold tracking-[-0.63px]',
  'text-[21px] font-semibold tracking-[0.42px]',
];
const STORE_NAMES = [
  'Fresh Mart',
  'FreshCo',
  'Style Hub',
  'Glamour Style',
  'TechZone',
  'DigiWorld',
];

const SCREENS = [
  { tint: 'bg-tech-tint', left: -100, wide: false, img: 'screen-driver-confirmed.png' },
  { tint: 'bg-info-tint', left: 216, wide: true, img: 'screen-plan.png' },
  { tint: 'bg-style-tint', left: 652, wide: false, img: 'screen-store-arrived.png' },
  { tint: 'bg-olive-tint', left: 968, wide: true, img: 'screen-live-map.png' },
  { tint: 'bg-chilled-tint', left: 1404, wide: false, img: 'screen-driver-issues.png' },
];

const STATS = [
  ['2', 'Depots', 'Peliyagoda and Kandy share one plan and one fleet view.'],
  [
    '38',
    'Vehicles',
    'Refrigerated trucks, ambient trucks and vans, each matched to what it can carry.',
  ],
  ['3', 'Brands', 'Fresh, Style and Tech, each with its own delivery windows.'],
  ['4', 'Roles', 'Dispatcher, loader, driver and store manager in one app.'],
];

const STEPS = [
  [
    '[01]',
    'Plan',
    'Dispatcher',
    "Build tomorrow's trips on a list or a map. Orders sort by delivery window, so the Fresh run always comes first.",
  ],
  [
    '[02]',
    'Load',
    'Loader',
    'Load each truck in reverse stop order, tick items off, and flag anything short before it leaves the dock.',
  ],
  [
    '[03]',
    'Deliver',
    'Driver',
    "Follow the route with in-app directions and tap 'I've arrived'. That is all the driver does at the door.",
  ],
  [
    '[04]',
    'Confirm',
    'Store manager',
    'The store checks every item and reports any problem. The driver acknowledges it before the next stop opens.',
  ],
];

const WORKSPACES = [
  {
    tint: 'bg-info-tint',
    ink: 'text-primary',
    role: 'DISPATCHER',
    name: 'Sync Console',
    device: 'Best on a computer',
    icon: 'card-console.svg',
  },
  {
    tint: 'bg-olive-tint',
    ink: 'text-olive-ink',
    role: 'LOADER',
    name: 'Sync Dock',
    device: 'Shared dock tablet',
    icon: 'card-dock.svg',
  },
  {
    tint: 'bg-tech-tint',
    ink: 'text-tech',
    role: 'DRIVER',
    name: 'Sync Driver',
    device: 'On your phone',
    icon: 'card-driver.svg',
  },
  {
    tint: 'bg-style-tint',
    ink: 'text-style',
    role: 'STORE MANAGER',
    name: 'Sync Store',
    device: 'On your phone',
    icon: 'card-store.svg',
  },
];

const PRINCIPLES = [
  [
    '01',
    "Warns, doesn't block",
    'You see a tight truck or a window at risk and decide. The only hard stops are facts: chilled goods need a fridge truck, and a hand-off needs both sides.',
  ],
  [
    '02',
    'The store confirms',
    'Goods are checked by the people receiving them. The driver acknowledges the result before moving on.',
  ],
  [
    '03',
    'Works without signal',
    'Drivers and loaders carry on offline. Everything syncs when the connection returns.',
  ],
  [
    '04',
    'Honest about location',
    "The map shows each truck's last reported position and when it was sent, never a guess shown as live.",
  ],
];

export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] bg-white px-4 pt-4">
      <SignedInRedirect />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-hero bg-ink lg:h-[640px]">
        <PhotoShade top={-40} />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/0 to-ink/60" />

        <div className="relative flex flex-col gap-10 px-5 pb-10 pt-6 sm:px-10 lg:contents">
          <nav className="flex h-11 items-center gap-8 lg:absolute lg:inset-x-10 lg:top-7">
            <div className="flex items-center gap-[10px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={`${A}/logo-mark.svg`} className="size-[39.6px]" />
              <p className="whitespace-nowrap text-[19px] font-semibold text-white">
                Waypoint Sync
              </p>
            </div>
            <div className="flex-1" />
            <div className="hidden items-center gap-8 text-[15px] font-medium text-white/85 lg:flex">
              <a href="#how-it-works">How it works</a>
              <a href="#workspaces">Workspaces</a>
              <a href="#behaves">How it behaves</a>
              <span>Help</span>
            </div>
            <div className="hidden flex-1 lg:block" />
            <PillLink href="/login" tone="white">
              Sign in
            </PillLink>
          </nav>

          <div className="flex flex-col gap-5 lg:contents">
            <div className="lg:absolute lg:left-10 lg:top-[132px]">
              <Eyebrow dark>Delivery management for Waypoint Group</Eyebrow>
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] text-white sm:text-[56px] md:text-[64px] lg:absolute lg:left-10 lg:top-[166px] lg:w-[860px] lg:text-[74px]">
              One plan for every delivery, seen by everyone who moves it.
            </h1>
          </div>

          <div className="flex flex-col gap-[22px] lg:absolute lg:left-[71%] lg:top-[420px]">
            <p className="text-[18px] text-white/[0.92] sm:text-[20px]">
              Planning, loading, delivery
              <br />
              and store confirmation
              <br />
              for Fresh, Style and Tech
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <PillLink href="/login" tone="olive">
                Sign in
              </PillLink>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-white px-5 py-3 text-[15px] font-semibold text-ink"
              >
                How it works
                <Arrow />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-2 whitespace-pre text-[14px] font-medium text-white/75 sm:gap-x-16 lg:absolute lg:bottom-[40px] lg:left-10 lg:gap-24">
            <p>{'+  Dispatch'}</p>
            <p>{'+  Dock'}</p>
            <p>{'+  Driver'}</p>
            <p>{'+  Store'}</p>
          </div>
        </div>
      </section>

      {/* Store strip */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 lg:gap-x-14 border-b border-hairline px-5 py-8 sm:px-10 sm:py-[34px]">
        <div className="flex items-center gap-[14px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={`${A}/asterisk.svg`} className="size-[30px]" />
          <p className="whitespace-nowrap text-[12px] font-semibold uppercase leading-[1.4] tracking-[0.48px] text-ink">
            One plan for every store
            <br />
            we deliver to
          </p>
        </div>
        <div className="hidden flex-1 lg:block" />
        {STORE_NAMES.map((n, i) => (
          <p key={n} className={`whitespace-nowrap text-faint ${STORES[i]}`}>
            {n}
          </p>
        ))}
      </section>

      {/* Statement */}
      <section className="flex flex-col gap-7 px-5 pb-12 pt-16 sm:px-10 lg:pb-16 lg:pt-[104px]">
        <Eyebrow>What it does</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-10">
          <p className="max-w-[920px] text-[28px] font-medium leading-[1.22] tracking-[-0.02em] text-ink sm:text-[34px] lg:text-[46px]">
            We keep dispatch, the loading dock, drivers and stores on one plan,{' '}
            <span className="text-faint">
              so every delivery leaves on time and arrives confirmed.
            </span>
          </p>
          <a href="#how-it-works" className="flex flex-col gap-[10px]">
            <span className="flex items-center gap-[10px]">
              <Arrow size={18} src="arrow-link.svg" />
              <span className="whitespace-nowrap text-[16px] font-semibold uppercase tracking-[0.32px] text-ink">
                See how it works
              </span>
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={`${A}/line.svg`} className="h-px w-[230px]" />
          </a>
        </div>
      </section>

      {/* Screen strip */}
      <section className="relative h-[420px] w-full overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-[1408px] -translate-x-1/2">
          {SCREENS.map((s) => (
            <div
              key={s.img}
              className={`absolute top-0 h-[420px] overflow-hidden rounded-card ${s.tint} ${s.wide ? 'w-[420px]' : 'w-[300px]'}`}
              style={{ left: s.left }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                src={`${A}/${s.img}`}
                className={`absolute max-w-none object-cover shadow-[0_12px_28px_0_rgba(13,26,41,0.18)] ${
                  s.wide
                    ? 'left-9 top-12 h-[455px] w-[640px] rounded-[14px]'
                    : 'left-[45px] top-11 h-[467px] w-[210px] rounded-[22px]'
                }`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="flex flex-col gap-7 px-5 pb-16 pt-14 sm:px-10 lg:pb-24 lg:pt-[88px]">
        <Eyebrow>By the numbers</Eyebrow>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map(([n, label, text]) => (
            <div key={label} className="flex flex-col gap-[14px]">
              <p className="text-[56px] font-medium leading-none tracking-[-2.24px] text-ink sm:text-[72px] sm:tracking-[-2.88px]">
                {n}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={`${A}/rule.svg`} className="h-px w-full" />
              <p className="text-[16px] font-semibold text-ink">{label}</p>
              <p className="text-[14px] leading-[1.5] text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="flex flex-col gap-9 rounded-hero bg-ink px-5 py-16 sm:px-10 lg:py-24"
      >
        <Eyebrow dark>How a delivery moves</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="text-[30px] font-medium leading-[1.1] tracking-[-1.3px] text-white sm:text-[40px] lg:text-[52px]">
            From tomorrow&apos;s plan
            <br />
            to a confirmed delivery
          </h2>
          <p className="w-[340px] max-w-full text-[15px] leading-[1.5] text-mist">
            Four people touch every delivery. Each one sees only what they need, at the moment they
            need it.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={`${A}/rule-dark.svg`} className="h-px w-full" />
        {STEPS.map(([num, name, who, text]) => (
          <div key={name} className="flex flex-col gap-9">
            <div className="flex flex-wrap items-center gap-8 py-2">
              <p className="whitespace-nowrap text-[15px] font-semibold text-olive">{num}</p>
              <p className="w-full text-[30px] sm:w-[220px] sm:text-[34px] font-medium tracking-[-0.51px] text-white">
                {name}
              </p>
              <span className="rounded-pill border border-slate px-[14px] py-[6px] text-[13px] font-semibold text-mist">
                {who}
              </span>
              <div className="hidden flex-1 lg:block" />
              <p className="w-full text-[16px] lg:w-[460px] leading-[1.5] text-mist">{text}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={`${A}/rule-dark.svg`} className="h-px w-full" />
          </div>
        ))}
      </section>

      {/* Workspaces */}
      <section id="workspaces" className="flex flex-col gap-8 px-5 pt-16 sm:px-10 lg:pt-[104px]">
        <Eyebrow>Workspaces</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-10">
          <h2 className="text-[30px] font-medium tracking-[-1.2px] text-ink sm:text-[40px] lg:text-[48px]">
            One app, four workspaces
          </h2>
          <p className="w-[360px] max-w-full text-[15px] leading-[1.5] text-muted">
            Everyone signs in at the same address and lands in the workspace built for their job and
            their device.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKSPACES.map((w) => (
            <Link
              key={w.name}
              href="/login"
              className={`flex flex-col gap-12 rounded-card p-7 ${w.tint}`}
            >
              <div className="flex items-center">
                <p className={`text-[12px] font-bold tracking-[0.72px] ${w.ink}`}>{w.role}</p>
                <div className="flex-1" />
                <span className="flex size-9 items-center justify-center rounded-pill bg-white">
                  <Arrow src={w.icon} />
                </span>
              </div>
              <div className="flex flex-col gap-[6px]">
                <p className="text-[28px] font-medium tracking-[-0.42px] text-ink">{w.name}</p>
                <p className="text-[14px] text-slate">{w.device}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it behaves */}
      <section id="behaves" className="flex flex-col gap-8 px-5 pt-16 sm:px-10 lg:pt-[104px]">
        <Eyebrow>How it behaves</Eyebrow>
        <h2 className="text-[30px] font-medium tracking-[-1.2px] text-ink sm:text-[40px] lg:text-[48px]">
          Built for how the day actually goes
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map(([n, title, text]) => (
            <div key={n} className="flex flex-col gap-[14px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={`${A}/rule-olive.svg`} className="h-px w-full" />
              <p className="text-[14px] font-semibold text-olive-ink">{n}</p>
              <p className="text-[22px] font-medium tracking-[-0.22px] text-ink">{title}</p>
              <p className="text-[15px] leading-[1.5] text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="h-16 lg:h-[104px]" />

      {/* Closing */}
      <section className="relative overflow-hidden rounded-hero bg-ink lg:h-[360px]">
        <PhotoShade top={-200} />
        <div className="relative flex flex-col items-start gap-5 px-6 py-14 sm:px-10 lg:contents">
          <div className="lg:absolute lg:left-14 lg:top-16">
            <Eyebrow dark>Start your shift</Eyebrow>
          </div>
          <p className="text-[36px] font-medium leading-[1.1] tracking-[-0.03em] text-white sm:text-[48px] lg:absolute lg:left-14 lg:top-[100px] lg:whitespace-nowrap lg:text-[64px] lg:leading-normal lg:tracking-[-1.92px]">
            Ready for today&apos;s run?
          </p>
          <p className="text-[16px] text-white/80 sm:text-[18px] lg:absolute lg:left-14 lg:top-[192px]">
            Sign in and pick your role. We remember it on this device for next time.
          </p>
          <div className="mt-2 lg:absolute lg:left-14 lg:top-[252px] lg:mt-0">
            <PillLink href="/login" tone="olive">
              Sign in
            </PillLink>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-10 pt-9 sm:px-6 text-[14px] text-muted">
        <p className="font-medium">Waypoint Sync · Waypoint Group</p>
        <div className="flex-1" />
        <p>Trouble signing in? IT support · 011 234 5678</p>
      </footer>
    </main>
  );
}
