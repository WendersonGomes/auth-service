import {
  Controller,
  Get,
  HttpException,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorCode } from '../../../common/errors/api-error.exception.js';
import type { AuthServiceRequest } from '../../../common/types/auth-service-request.js';
import { AuthSessionService } from './auth-session.service.js';

@Controller('api/auth')
export class AuthSessionController {
  private readonly logger = new Logger(AuthSessionController.name);

  constructor(private readonly authSessionService: AuthSessionService) {}

  @Get('google/url')
  async googleUrl(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const url = await this.authSessionService.getGoogleOAuthUrl(req, res);

    return { url };
  }

  @Get('google')
  async google(@Req() req: Request, @Res() res: Response) {
    const url = await this.authSessionService.getGoogleOAuthUrl(req, res);

    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Req() req: AuthServiceRequest,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.redirect(
        this.authSessionService.loginErrorUrl('oauth_code_missing'),
      );
    }

    try {
      await this.authSessionService.handleCallback(code, req, res);
    } catch (error) {
      this.logCallbackFailure(error, code, req);
      this.authSessionService.clearAuthCookies(res);
      this.authSessionService.clearTransientSupabaseCookies(req, res);

      return res.redirect(
        this.authSessionService.loginErrorUrl(this.callbackErrorCode(error)),
      );
    }

    return res.redirect(this.authSessionService.loginSuccessUrl);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    await this.authSessionService.refresh(req, res);

    return res.json({ success: true });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.authSessionService.logout(req, res);

    return res.json({ success: true });
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.authSessionService.me(req);
  }

  private mapCallbackError(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        response.code === 'AUTH_DATABASE_UNAVAILABLE'
      ) {
        return 'auth_temporarily_unavailable';
      }
    }

    return 'oauth_failed';
  }

  private logCallbackFailure(
    error: unknown,
    code: string | undefined,
    req: AuthServiceRequest,
  ) {
    const logPayload = {
      message: 'OAuth callback failed',
      requestId: req.requestId ?? req.headers['x-request-id'],
      route: req.originalUrl ?? req.url,
      method: req.method,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: this.safeCause(error),
      codeReceived: Boolean(code),
      frontendUrl: this.authSessionService.getFrontendUrl(),
      apiPublicUrl: this.authSessionService.getApiPublicUrlForLog(),
    };

    this.logger.error(
      JSON.stringify(logPayload),
      error instanceof Error ? error.stack : undefined,
    );
  }

  private safeCause(error: unknown) {
    if (!(error instanceof Error)) {
      return undefined;
    }

    const cause = (error as Error & { cause?: unknown }).cause;

    if (cause instanceof Error) {
      return {
        name: cause.name,
        message: cause.message,
        stack: cause.stack,
      };
    }

    if (typeof cause === 'string') {
      return cause;
    }

    return undefined;
  }

  private getApiErrorCode(error: unknown): ApiErrorCode | undefined {
    if (!(error instanceof HttpException)) {
      return undefined;
    }

    const response = error.getResponse();

    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string'
    ) {
      return response.code as ApiErrorCode;
    }

    return undefined;
  }

  private callbackErrorCode(error: unknown) {
    const code = this.getApiErrorCode(error);

    switch (code) {
      case 'AUTH_OAUTH_CODE_EXCHANGE_FAILED':
        return 'oauth_code_exchange_failed';
      case 'AUTH_OAUTH_SESSION_MISSING':
        return 'oauth_session_missing';
      case 'AUTH_EMAIL_MISSING':
        return 'email_missing';
      case 'AUTH_DATABASE_UNAVAILABLE':
        return 'profile_sync_failed';
      case 'AUTH_TOKEN_ISSUE_FAILED':
        return 'token_issue_failed';
      case 'AUTH_REFRESH_TOKEN_FAILED':
        return 'refresh_token_failed';
      default:
        return this.mapCallbackError(error);
    }
  }
}
