import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DOCK_PASSWORD_PATTERN,
  PASSWORD_MIN_LENGTH,
  PIN_PATTERN,
  type ChangePasswordResponse,
  type Me,
  type NotificationPreferences,
} from '@waypoint/contracts';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ChangePasswordDto } from './dto/profile.dto';

const PREF_KEYS = Object.keys(
  DEFAULT_NOTIFICATION_PREFERENCES,
) as (keyof NotificationPreferences)[];

/** Drivers and loaders sign in with a PIN; dispatchers and stores with a password (as in AuthService.login). */
const usesPin = (role: AuthUser['role']) => role === 'driver' || role === 'loader';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dispatchers pick their depot. A store's depot comes from its store, a driver's from the vehicle,
   * and a dock tablet belongs to the depot whose dock password unlocked it.
   */
  async changeDepot(me: AuthUser, depotId: string): Promise<Me> {
    if (me.role !== 'dispatcher') {
      throw new ForbiddenException('Only dispatchers can change depot');
    }
    const depot = await this.prisma.depot.findUnique({ where: { id: depotId } });
    if (!depot) throw new NotFoundException('Depot not found');
    const user = await this.prisma.user.update({ where: { id: me.id }, data: { depotId } });
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      depotId: user.depotId,
      storeId: user.storeId,
    };
  }

  /**
   * Checks the current secret, saves the new one and signs out every other session of this user.
   * A wrong current secret is a 400, not a 401, so the client stays signed in.
   */
  async changePassword(
    me: AuthUser,
    sessionId: string | undefined,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    if (me.role === 'loader') return this.changeDockPassword(me, dto);
    const pin = usesPin(me.role);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    const hash = pin ? user.pinHash : user.passwordHash;
    // A PIN role that never had a PIN (loader sign-in needs none) sets its first one without it.
    const firstPin = pin && !hash;
    if (
      !firstPin &&
      (!hash || !dto.currentSecret || !(await argon2.verify(hash, dto.currentSecret)))
    ) {
      throw new BadRequestException({
        reason: 'WRONG_CURRENT_SECRET',
        message: pin ? 'The current PIN is not right.' : 'The current password is not right.',
      });
    }
    if (pin ? !PIN_PATTERN.test(dto.newSecret) : dto.newSecret.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException({
        reason: 'WEAK_SECRET',
        message: pin
          ? 'The new PIN must be 4 to 6 digits.'
          : `The new password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      });
    }
    const newHash = await argon2.hash(dto.newSecret);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: me.id },
        data: pin ? { pinHash: newHash } : { passwordHash: newHash },
      }),
      this.prisma.session.deleteMany({
        where: { userId: me.id, ...(sessionId ? { id: { not: sessionId } } : {}) },
      }),
    ]);
    return { ok: true };
  }

  /** The dock tablet's sign-in: changing it saves the depot's new password; tablets already unlocked stay unlocked. */
  private async changeDockPassword(
    me: AuthUser,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    const depot = me.depotId
      ? await this.prisma.depot.findUnique({ where: { id: me.depotId } })
      : null;
    if (!depot) throw new NotFoundException('Depot not found');
    if (
      !depot.dockPasswordHash ||
      !dto.currentSecret ||
      !(await argon2.verify(depot.dockPasswordHash, dto.currentSecret))
    ) {
      throw new BadRequestException({
        reason: 'WRONG_CURRENT_SECRET',
        message: 'The current dock password is not right.',
      });
    }
    if (!DOCK_PASSWORD_PATTERN.test(dto.newSecret)) {
      throw new BadRequestException({
        reason: 'WEAK_SECRET',
        message: 'The new dock password must be 6 digits.',
      });
    }
    await this.prisma.depot.update({
      where: { id: depot.id },
      data: { dockPasswordHash: await argon2.hash(dto.newSecret) },
    });
    return { ok: true };
  }

  async notificationPreferences(me: AuthUser): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { notificationPrefs: true },
    });
    const saved = (user.notificationPrefs ?? {}) as Partial<Record<string, unknown>>;
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    for (const key of PREF_KEYS) {
      if (typeof saved[key] === 'boolean') prefs[key] = saved[key];
    }
    return prefs;
  }

  async saveNotificationPreferences(
    me: AuthUser,
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    // Only the four known keys are stored, whatever else the object carries.
    const clean: NotificationPreferences = {
      deliveryUpdates: prefs.deliveryUpdates,
      delayAlerts: prefs.delayAlerts,
      incidentAlerts: prefs.incidentAlerts,
      planChanges: prefs.planChanges,
    };
    await this.prisma.user.update({
      where: { id: me.id },
      data: { notificationPrefs: { ...clean } satisfies Prisma.InputJsonObject },
    });
    return clean;
  }
}
