import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { LoginResponse, Me } from '@waypoint/contracts';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthedRequest,
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { SESSION_COOKIE } from '../common/guards/session.guard';
import { AuthService, sessionTtlMs } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { token, body } = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtlMs(),
    });
    return body;
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return user;
  }
}
