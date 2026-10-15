'use client';

import { useState } from 'react';
import type { AutoAssignProposal } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { Modal, ModalIcon, OutlineButton, SolidButton } from './Modal';
import type { PlanEdit } from './usePlanEdit';

const RULES = [
  'Waiting since yesterday first',
  'Chilled on refrigerated only',
  '1 brand + 1 district per trip',
  'All windows and time limits met',
];

function Stat({
  value,
  label,
  tone = 'text-ink',
}: {
  value: string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-px flex-1 flex-col gap-[2px] whitespace-nowrap rounded-note bg-bg p-[14px]">
      <span className={`text-[22px] font-bold leading-[31px] ${tone}`}>{value}</span>
      <span className="text-[12px] font-medium leading-[17px] text-muted">{label}</span>
    </div>
  );
}

function Change({
  tint,
  ink,
  icon,
  big,
  title,
  text,
  children,
}: {
  tint: string;
  ink: string;
  icon: 'check' | 'plus' | 'clock';
  big: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-px flex-1 flex-col gap-[6px] rounded-[18px] p-4 ${tint}`}>
      <div className="flex items-center gap-[10px]">
        <span className={`flex size-8 items-center justify-center rounded-full bg-surface ${ink}`}>
          <Icon name={icon} size={16} />
        </span>
        <p className={`whitespace-nowrap text-[20px] font-bold leading-7 ${ink}`}>{big}</p>
      </div>
      <p className="text-[14px] font-semibold leading-5 text-ink">{title}</p>
      <p className="text-[12px] leading-[17px] text-muted">{text}</p>
      {children}
    </div>
  );
}

/** Figma "Plan v2 / Auto-assign": what the proposal would do. Nothing is saved until Apply. */
export function AutoAssignModal({
  proposal,
  date,
  edit,
}: {
  proposal: AutoAssignProposal;
  date: string;
  edit: PlanEdit;
}) {
  const [busy, setBusy] = useState(false);
  const [seeing, setSeeing] = useState(false);
  const trips = proposal.newTrips;

  async function apply() {
    setBusy(true);
    try {
      await api('/plan/auto-assign/apply', { method: 'POST', body: { date } });
      await edit.reload();
      edit.closeModal();
      edit.showToast({
        kind: 'ok',
        title: `Auto-assign applied: ${proposal.ordersPlaced} orders placed`,
        sub:
          proposal.movedToLater > 0
            ? `${proposal.movedToLater} moved to later, stores told why`
            : 'Review the trips, then publish',
      });
    } catch {
      setBusy(false);
      edit.closeModal();
      edit.showToast({
        kind: 'error',
        title: 'Auto-assign could not be applied',
        sub: 'Nothing was changed. Try again.',
      });
    }
  }

  return (
    <Modal label="Auto-assign proposal" width={660} onClose={edit.closeModal}>
      <div className="flex items-center gap-[14px]">
        <ModalIcon tone="bg-info-tint text-slate">
          <Icon name="sparkle" size={22} />
        </ModalIcon>
        <div className="flex min-w-px flex-1 flex-col gap-[2px] whitespace-nowrap">
          <h2 className="text-[24px] font-semibold leading-[30px] text-ink">
            Auto-assign proposal
          </h2>
          <p className="text-[13px] leading-[18px] text-muted">
            Nothing changes until you apply it.
          </p>
        </div>
      </div>

      <div className="flex gap-[10px]">
        <Stat value={String(proposal.tripsAfter)} label="Trips" />
        <Stat value={String(proposal.ordersPlaced)} label="Orders placed" tone="text-success" />
        <Stat value={String(proposal.movedToLater)} label="Moved to later" tone="text-warning" />
        <Stat value={`${proposal.capacityUsedPct}%`} label="Capacity used" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold leading-[18px] text-muted">Rules it followed</p>
        <div className="flex flex-wrap gap-[6px]">
          {RULES.map((r) => (
            <span
              key={r}
              className="flex items-center gap-[6px] rounded-pill bg-bg px-[10px] py-[6px] text-[12px] font-medium leading-[17px] text-ink"
            >
              <Icon name="rules" size={12} className="text-success" />
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[10px]">
        <p className="text-[18px] font-semibold leading-[25px] text-ink">
          What will change if you apply
        </p>
        <div className="flex gap-[10px]">
          <Change
            tint="bg-success-tint"
            ink="text-success"
            icon="check"
            big={`${proposal.ordersPlaced} orders`}
            title="placed on trips"
            text={
              proposal.addedToExisting > 0
                ? `${proposal.addedToExisting} go on trips that still had room.`
                : 'All go on new trips.'
            }
          />
          <Change
            tint="bg-success-tint"
            ink="text-success"
            icon="plus"
            big={`${trips.length} new ${trips.length === 1 ? 'trip' : 'trips'}`}
            title={trips.length === 0 ? 'no new trips needed' : 'using free vehicles'}
            text={
              trips.length === 0
                ? 'Existing trips have room.'
                : trips.map((t) => t.label).join(' and ') + '.'
            }
          />
        </div>
        {proposal.movedToLater > 0 && (
          <Change
            tint="bg-warning-tint"
            ink="text-warning"
            icon="clock"
            big={`${proposal.movedToLater} ${proposal.movedToLater === 1 ? 'order' : 'orders'} moved to later`}
            title="move to the next day with priority"
            text="No space left that the rules allow. Stores get the reason automatically."
          >
            <button
              type="button"
              onClick={() => setSeeing(!seeing)}
              className="self-start text-[12px] font-bold leading-[17px] text-warning"
            >
              {seeing ? 'Hide' : `See which ${proposal.movedToLater}`} →
            </button>
            {seeing &&
              proposal.deferred.map((d) => (
                <p key={d.orderId} className="text-[12px] leading-[17px] text-ink">
                  {d.storeName} · {d.reason}
                </p>
              ))}
          </Change>
        )}
      </div>

      <div className="flex gap-[10px]">
        <OutlineButton onClick={edit.closeModal}>Discard</OutlineButton>
        <span className="min-w-px flex-1" />
        <SolidButton
          onClick={apply}
          disabled={busy || proposal.ordersPlaced + proposal.movedToLater === 0}
        >
          Apply proposal
        </SolidButton>
      </div>
    </Modal>
  );
}
