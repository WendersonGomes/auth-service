import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type JsonWebKey,
} from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Jwk = JsonWebKey & {
  alg: 'RS256';
  kid: string;
  use: 'sig';
};

export type FoodWiseJwtPayload = {
  sub: string;
  email: string;
  roles: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

export type JwtUser = {
  id: string;
  email: string;
  roles: string[];
};

@Injectable()
export class JwtTokenService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly kid: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;

  constructor(private readonly configService: ConfigService) {
    this.issuer = this.configService.get<string>(
      'AUTH_JWT_ISSUER',
      'food-wise-auth-service',
    );
    this.audience = this.configService.get<string>(
      'AUTH_JWT_AUDIENCE',
      'food-wise-api',
    );
    this.kid = this.configService.get<string>(
      'AUTH_JWT_KID',
      'food-wise-rs256-1',
    );
    this.accessTokenTtlSeconds = this.readPositiveInt(
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      900,
    );
    this.privateKeyPem = this.normalizePem(
      this.configService.getOrThrow<string>('AUTH_JWT_PRIVATE_KEY_PEM'),
    );
    this.publicKeyPem = this.normalizePem(
      this.configService.getOrThrow<string>('AUTH_JWT_PUBLIC_KEY_PEM'),
    );
  }

  get accessTtlSeconds() {
    return this.accessTokenTtlSeconds;
  }

  async signAccessToken(user: JwtUser): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: FoodWiseJwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles.length > 0 ? user.roles : ['user'],
      iss: this.issuer,
      aud: this.audience,
      iat: issuedAt,
      exp: issuedAt + this.accessTokenTtlSeconds,
    };

    const encodedHeader = this.base64UrlJson({
      alg: 'RS256',
      kid: this.kid,
      typ: 'JWT',
    });
    const encodedPayload = this.base64UrlJson(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(signingInput),
      createPrivateKey(this.privateKeyPem),
    );

    return `${signingInput}.${this.base64Url(signature)}`;
  }

  async verifyAccessToken(token: string): Promise<JwtUser> {
    try {
      const payload = this.verifyToken(token);

      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token invalido ou expirado');
    }
  }

  async getJwks(): Promise<{ keys: Jwk[] }> {
    const jwk = createPublicKey(this.publicKeyPem).export({
      format: 'jwk',
    }) as JsonWebKey;

    return {
      keys: [
        {
          ...jwk,
          alg: 'RS256',
          kid: this.kid,
          use: 'sig',
        },
      ],
    };
  }

  private verifyToken(token: string): FoodWiseJwtPayload {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedException('Token invalido');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = this.parseBase64UrlJson(encodedHeader);

    if (header.alg !== 'RS256' || header.kid !== this.kid) {
      throw new UnauthorizedException('Token invalido');
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const isValidSignature = verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      createPublicKey(this.publicKeyPem),
      this.fromBase64Url(encodedSignature),
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('Token invalido');
    }

    const payload = this.parseBase64UrlJson(
      encodedPayload,
    ) as Partial<FoodWiseJwtPayload>;
    const now = Math.floor(Date.now() / 1000);

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      !Array.isArray(payload.roles) ||
      payload.roles.some((role) => typeof role !== 'string') ||
      payload.iss !== this.issuer ||
      payload.aud !== this.audience ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      throw new UnauthorizedException('Token invalido ou expirado');
    }

    return payload as FoodWiseJwtPayload;
  }

  private base64UrlJson(value: unknown) {
    return this.base64Url(Buffer.from(JSON.stringify(value)));
  }

  private parseBase64UrlJson(value: string): Record<string, unknown> {
    const parsed = JSON.parse(this.fromBase64Url(value).toString('utf8'));

    if (typeof parsed !== 'object' || parsed === null) {
      throw new UnauthorizedException('Token invalido');
    }

    return parsed as Record<string, unknown>;
  }

  private base64Url(value: Buffer) {
    return value.toString('base64url');
  }

  private fromBase64Url(value: string) {
    return Buffer.from(value, 'base64url');
  }

  private normalizePem(value: string) {
    return value.replace(/\\n/g, '\n').trim();
  }

  private readPositiveInt(name: string, fallback: number) {
    const value = Number(this.configService.get<string>(name));

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
