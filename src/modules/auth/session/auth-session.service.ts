import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from '../auth.service.js';
import { SupabaseServerClientService } from '../supabase/supabase-server-client.service.js';
import { JwtTokenService, type JwtUser } from '../tokens/jwt-token.service.js';
import { RefreshTokenService } from '../tokens/refresh-token.service.js';
import {
  AuthGoogleOAuthUrlFailedException,
  AuthGoogleOAuthUrlMissingException,
  AuthEmailMissingException,
  AuthInvalidRedirectUrlException,
  AuthOAuthCodeExchangeFailedException,
  AuthOAuthSessionMissingException,
  AuthRefreshTokenFailedException,
  AuthTokenIssueFailedException,
} from '../../../common/errors/api-error.exception.js';
import type { AuthServiceRequest } from '../../../common/types/auth-service-request.js';

type SupabaseMetadata = Record<string, unknown>;

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly supabaseServerClient: SupabaseServerClientService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async getGoogleOAuthUrl(req: Request, res: Response): Promise<string> {
    const redirectTo = this.authCallbackUrl;
    const supabase = this.supabaseServerClient.create(req, res, {
      writeSupabaseCookies: true,
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'google_oauth_url_failed',
          redirectTo,
          supabaseError: error.message,
        }),
      );

      throw new AuthGoogleOAuthUrlFailedException({
        redirectTo,
        supabaseError: error.message,
      });
    }

    if (!data.url) {
      this.logger.warn(
        JSON.stringify({
          event: 'google_oauth_url_missing',
          redirectTo,
        }),
      );

      throw new AuthGoogleOAuthUrlMissingException({
        redirectTo,
      });
    }

    return data.url;
  }

  async handleCallback(code: string, req: AuthServiceRequest, res: Response) {
    this.logCallbackStep('OAuth callback started', req, {
      codeReceived: Boolean(code),
      frontendUrl: this.frontendUrl,
      apiPublicUrl: this.apiPublicUrl,
    });

    const supabase = this.supabaseServerClient.create(req, res, {
      writeSupabaseCookies: true,
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw new AuthOAuthCodeExchangeFailedException({
        supabaseError: error.message,
      });
    }

    if (!data.session || !data.user) {
      throw new AuthOAuthSessionMissingException();
    }

    this.logCallbackStep('OAuth session exchanged successfully', req);

    const email = data.user.email;

    if (!email || !isEmail(email)) {
      throw new AuthEmailMissingException();
    }

    const metadata = (data.user.user_metadata ?? {}) as SupabaseMetadata;
    const profile = await this.authService.syncProfile({
      userId: data.user.id,
      email,
      displayName: this.getOptionalString(metadata.full_name ?? metadata.name),
      avatarUrl: this.getOptionalString(
        metadata.avatar_url ?? metadata.picture,
      ),
    });

    this.logCallbackStep('Profile upserted successfully', req, {
      userId: profile.id,
    });

    await this.issueCookies(res, {
      id: profile.id,
      email: profile.email ?? email,
      roles: ['user'],
    });
    this.logCallbackStep('Auth cookies set successfully', req);

    this.supabaseServerClient.clearSupabaseCookies(req, res);
    this.logCallbackStep('Redirecting to frontend', req, {
      frontendUrl: this.frontendUrl,
    });
  }

  async me(req: Request) {
    const accessToken = this.readCookie(req, this.accessCookieName);
    const user = await this.jwtTokenService.verifyAccessToken(accessToken);
    const profile = await this.authService.getMe(user.id);

    return {
      user: {
        id: user.id,
        email: profile.email ?? user.email,
        roles: user.roles,
      },
      profile: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    };
  }

  async refresh(req: Request, res: Response) {
    const currentRefreshToken = this.readCookie(req, this.refreshCookieName);
    const rotated = await this.refreshTokenService.rotate(currentRefreshToken);

    await this.issueCookies(
      res,
      {
        id: rotated.profile.id,
        email: rotated.profile.email ?? '',
        roles: ['user'],
      },
      rotated.token,
    );
  }

  async logout(req: Request, res: Response) {
    const refreshToken = this.readOptionalCookie(req, this.refreshCookieName);

    if (refreshToken) {
      await this.refreshTokenService.revoke(refreshToken);
    }

    this.clearAuthCookies(res);
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(this.accessCookieName, this.accessCookieOptions());
    res.clearCookie(this.refreshCookieName, this.refreshCookieOptions());
  }

  clearTransientSupabaseCookies(req: Request, res: Response) {
    this.supabaseServerClient.clearSupabaseCookies(req, res);
  }

  getFrontendUrl() {
    return this.frontendUrl;
  }

  getApiPublicUrlForLog() {
    try {
      return this.apiPublicUrl;
    } catch {
      return undefined;
    }
  }

  get loginSuccessUrl() {
    return this.frontendUrl;
  }

  loginErrorUrl(error: string) {
    return `${this.frontendUrl}/login?error=${encodeURIComponent(error)}`;
  }

  private async issueCookies(
    res: Response,
    user: JwtUser,
    existingRefreshToken?: string,
  ) {
    if (!user.email || !isEmail(user.email)) {
      throw new UnauthorizedException('Usuario sem email valido');
    }

    let accessToken: string;

    try {
      accessToken = await this.jwtTokenService.signAccessToken(user);
    } catch (error) {
      throw new AuthTokenIssueFailedException({
        cause:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
    }

    let refreshToken: { token: string };

    try {
      refreshToken = existingRefreshToken
        ? {
            token: existingRefreshToken,
          }
        : await this.refreshTokenService.issue(user.id);
    } catch (error) {
      throw new AuthRefreshTokenFailedException({
        cause:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
    }

    res.cookie(this.accessCookieName, accessToken, this.accessCookieOptions());
    res.cookie(
      this.refreshCookieName,
      refreshToken.token,
      this.refreshCookieOptions(),
    );
  }

  private logCallbackStep(
    message: string,
    req: AuthServiceRequest,
    extra: Record<string, unknown> = {},
  ) {
    this.logger.log(
      JSON.stringify({
        message,
        requestId: req.requestId ?? req.headers['x-request-id'],
        route: req.originalUrl ?? req.url,
        method: req.method,
        ...extra,
      }),
    );
  }

  private readCookie(req: Request, name: string) {
    const value = this.readOptionalCookie(req, name);

    if (!value) {
      throw new UnauthorizedException('Sessao ausente');
    }

    return value;
  }

  private readOptionalCookie(req: Request, name: string) {
    const value = req.cookies?.[name];

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private accessCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions(),
      path: '/',
      maxAge: this.jwtTokenService.accessTtlSeconds * 1000,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions(),
      path: '/api/auth',
      maxAge: this.refreshTokenService.refreshTtlMilliseconds,
    };
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: this.sameSite,
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    };
  }

  private getOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private get authCallbackUrl() {
    return this.buildCallbackUrl(this.apiPublicUrl);
  }

  private get frontendUrl() {
    return this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
  }

  private get apiPublicUrl() {
    const apiPublicUrl = this.configService.get<string>('API_PUBLIC_URL');

    if (!apiPublicUrl || apiPublicUrl.trim().length === 0) {
      throw new AuthInvalidRedirectUrlException({
        missingVariable: 'API_PUBLIC_URL',
      });
    }

    return apiPublicUrl.replace(/\/$/, '');
  }

  private buildCallbackUrl(apiPublicUrl: string) {
    try {
      const url = new URL('/api/auth/callback', `${apiPublicUrl}/`);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }

      return url.toString();
    } catch {
      throw new AuthInvalidRedirectUrlException({
        redirectTo: `${apiPublicUrl}/api/auth/callback`,
      });
    }
  }

  private get accessCookieName() {
    return this.configService.get<string>(
      'AUTH_ACCESS_TOKEN_COOKIE_NAME',
      'fw_access',
    );
  }

  private get refreshCookieName() {
    return this.configService.get<string>(
      'AUTH_REFRESH_TOKEN_COOKIE_NAME',
      'fw_refresh',
    );
  }

  private get cookieDomain() {
    return this.configService.get<string>('AUTH_COOKIE_DOMAIN') || undefined;
  }

  private get secureCookies() {
    return (
      this.configService.get<string>('AUTH_COOKIE_SECURE') === 'true' ||
      process.env.NODE_ENV === 'production'
    );
  }

  private get sameSite(): CookieOptions['sameSite'] {
    const value = this.configService.get<string>(
      'AUTH_COOKIE_SAME_SITE',
      'lax',
    );

    if (value === 'strict' || value === 'none') {
      return value;
    }

    return 'lax';
  }
}
