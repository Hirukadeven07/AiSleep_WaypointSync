import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { dockLoginId, type LoginResponse, type Profile, type Role } from '@waypoint/contracts';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

const HOMES: Record<Role, string> = {
  dispatcher: '/dispatch',
  store: '/store',
  loader: '/dock',
  driver: '/drive',
};

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The dock tablet: a loader signs in with the depot and the depot's dock password (6 digits,
   * stored hashed on the Depot). That opens one shared account per depot. Each loader then
   * confirms themselves with their own ID and PIN when starting to load a truck.
   */
  private async dockUser(dto: LoginDto) {
    const depot = dto.depotId
      ? await this.prisma.depot.findUnique({ where: { id: dto.depotId } })
      : null;
    if (
      !depot?.dockPasswordHash ||
      !dto.secret ||
      !(await argon2.verify(depot.dockPasswordHash, dto.secret))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const data = { role: 'loader' as const, name: `Dock · ${depot.name}`, depotId: depot.id };
    return this.prisma.user.upsert({
      where: { loginId: dockLoginId(depot.id) },
      update: data,
      create: { loginId: dockLoginId(depot.id), ...data },
    });
  }

  async login(dto: LoginDto): Promise<{ token: string; expiresAt: Date; body: LoginResponse }> {
    const user =
      dto.role === 'loader'
        ? await this.dockUser(dto)
        : dto.loginId
          ? await this.prisma.user.findUnique({ where: { loginId: dto.loginId } })
          : null;
    if (!user || user.role !== dto.role) throw new UnauthorizedException('Invalid credentials');

    switch (dto.role) {
      case 'dispatcher':
      case 'store':
        if (!user.passwordHash || !dto.secret || !(await argon2.verify(user.passwordHash, dto.secret))) {
          throw new UnauthorizedException('Invalid credentials');
        }
        break;
      case 'driver':
        if (!user.pinHash || !dto.secret || !(await argon2.verify(user.pinHash, dto.secret))) {
          throw new UnauthorizedException('Invalid credentials');
        }
        break;
      case 'loader':
        // Already checked against the depot's dock password in dockUser().
        break;
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + sessionTtlMs());
    await this.prisma.session.create({ data: { id: token, userId: user.id, expiresAt } });

    return { token, expiresAt, body: { role: user.role, home: HOMES[user.role] } };
  }

  /** The signed-in user's details for the account card. */
  async profile(userId: string, sessionId: string | undefined): Promise<Profile> {
    const [user, session] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          depot: true,
          store: { include: { phones: true } },
          dispatcherProfile: { include: { phones: true } },
          driverProfile: { include: { phones: true } },
          loaderProfile: { include: { phones: true } },
        },
      }),
      sessionId ? this.prisma.session.findUnique({ where: { id: sessionId } }) : null,
    ]);
    const phone =
      user.driverProfile?.phones[0]?.phoneNumber ??
      user.loaderProfile?.phones[0]?.phoneNumber ??
      user.dispatcherProfile?.phones[0]?.phoneNumber ??
      user.store?.phones.find((p) => p.label === 'shop')?.phoneNo ??
      user.store?.phones[0]?.phoneNo ??
      null;
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      loginId: user.loginId,
      phone,
      depot: user.depot ? { id: user.depot.id, name: user.depot.name } : null,
      store: user.store
        ? { id: user.store.id, name: user.store.displayName ?? user.store.id }
        : null,
      employeeNo: user.dispatcherProfile?.employeeNo ?? null,
      signedInAt: session?.createdAt.toISOString() ?? null,
      sessionExpiresAt: session?.expiresAt.toISOString() ?? null,
    };
  }

  async logout(sessionId: string | undefined) {
    if (!sessionId) return;
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }
}
