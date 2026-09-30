import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthedRequest } from '../decorators/current-user.decorator';

export const SESSION_COOKIE = 'ws_session';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    const session = await this.prisma.session.findUnique({
      where: { id: token },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    const { user } = session;
    req.sessionId = session.id;
    req.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      depotId: user.depotId,
      storeId: user.storeId,
    };
    return true;
  }
}
