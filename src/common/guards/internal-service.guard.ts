import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { InternalAuthFailedException } from '../errors/api-error.exception.js';
import type { AuthServiceRequest } from '../types/auth-service-request.js';

const USER_ID_HEADER = 'x-user-id';
const USER_EMAIL_HEADER = 'x-user-email';
const INTERNAL_TOKEN_HEADER = 'x-internal-service-token';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly currentToken: string;
  private readonly previousToken?: string;

  constructor(configService: ConfigService) {
    const currentToken = configService.get<string>(
      'ALLOWED_GATEWAY_TOKEN_CURRENT',
    );
    const previousToken = configService.get<string>(
      'ALLOWED_GATEWAY_TOKEN_PREVIOUS',
    );

    if (!currentToken) {
      throw new Error('ALLOWED_GATEWAY_TOKEN_CURRENT is required');
    }

    this.currentToken = currentToken;
    this.previousToken = previousToken || undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthServiceRequest>();

    const token = this.getSingleHeader(
      request.headers[INTERNAL_TOKEN_HEADER],
    );

    if (!token || !this.isAllowedToken(token)) {
      throw new InternalAuthFailedException();
    }

    const userId = this.getSingleHeader(request.headers[USER_ID_HEADER]);

    if (!userId || !UUID_REGEX.test(userId)) {
      throw new BadRequestException('Header x-user-id inválido');
    }

    request.internalUserId = userId;
    request.internalUserEmail = this.getSingleHeader(
      request.headers[USER_EMAIL_HEADER],
    );

    return true;
  }

  private isAllowedToken(token: string): boolean {
    if (this.tokensMatch(token, this.currentToken)) {
      return true;
    }

    return this.previousToken
      ? this.tokensMatch(token, this.previousToken)
      : false;
  }

  private tokensMatch(receivedToken: string, allowedToken: string): boolean {
    const received = Buffer.from(receivedToken);
    const allowed = Buffer.from(allowedToken);

    if (received.length !== allowed.length) {
      timingSafeEqual(allowed, allowed);
      return false;
    }

    return timingSafeEqual(received, allowed);
  }

  private getSingleHeader(header: unknown): string | undefined {
    if (typeof header !== 'string') {
      return undefined;
    }

    return header;
  }
}
