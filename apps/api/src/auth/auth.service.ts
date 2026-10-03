import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { LoginResponse, Profile, Role } from '@waypoint/contracts';
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

  async login(dto: LoginDto): Promise<{ token: string; expiresAt: Date; body: LoginResponse }> {
    const user = await this.prisma.user.findUnique({ where: { loginId: dto.loginId } });
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
        if (!dto.depotId || user.depotId !== dto.depotId) {
          throw new UnauthorizedException('Invalid credentials');
        }
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
        include: { depot: true, store: true, dispatcherProfile: true },
      }),
      sessionId ? this.prisma.session.findUnique({ where: { id: sessionId } }) : null,
    ]);
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      loginId: user.loginId,
      phone: user.phone,
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
