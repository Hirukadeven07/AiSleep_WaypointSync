'use client';

import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { AccountMenu } from './AccountMenu';

/** Slim row above phone screens: holds the account menu, which is where sign-out lives. */
export function PhoneTopRow({ me }: { me: Me }) {
  return (
    <div className="flex h-12 items-center px-5">
      <AccountMenu
        me={me}
        placement="below-start"
        label="Account"
        className="flex size-9 items-center justify-center rounded-full bg-sand text-primary"
      >
        <Icon name="user" size={16} />
      </AccountMenu>
    </div>
  );
}
