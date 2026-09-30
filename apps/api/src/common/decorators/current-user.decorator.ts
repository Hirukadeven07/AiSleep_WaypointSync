import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Me } from '@waypoint/contracts';

export type AuthUser = Me;

export type AuthedRequest = Request & { user?: AuthUser; sessionId?: string };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
