import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Profile } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';

type IssuedRefreshToken = {
  token: string;
  expiresAt: Date;
};

type RotatedRefreshToken = IssuedRefreshToken & {
  profile: Profile;
};

@Injectable()
export class RefreshTokenService {
  private readonly refreshTokenTtlDays: number;
  private readonly refreshTokenPepper: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.refreshTokenTtlDays = this.readPositiveInt(
      'AUTH_REFRESH_TOKEN_TTL_DAYS',
      30,
    );
    this.refreshTokenPepper = this.configService.get<string>(
      'AUTH_REFRESH_TOKEN_PEPPER',
      '',
    );
  }

  get refreshTtlMilliseconds() {
    return this.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  }

  async issue(userId: string): Promise<IssuedRefreshToken> {
    const token = this.generateToken();
    const expiresAt = this.expiresAt();

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        familyId: randomUUID(),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async rotate(token: string): Promise<RotatedRefreshToken> {
    const tokenHash = this.hashToken(token);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { profile: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    if (
      existing.revokedAt ||
      existing.replacedByTokenId ||
      existing.expiresAt <= new Date()
    ) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token invalido ou expirado');
    }

    const nextToken = this.generateToken();
    const nextTokenId = randomUUID();
    const nextExpiresAt = this.expiresAt();

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          id: nextTokenId,
          tokenHash: this.hashToken(nextToken),
          userId: existing.userId,
          familyId: existing.familyId,
          expiresAt: nextExpiresAt,
        },
      }),
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: nextTokenId,
        },
      }),
    ]);

    return {
      token: nextToken,
      expiresAt: nextExpiresAt,
      profile: existing.profile,
    };
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private generateToken() {
    return randomBytes(64).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256')
      .update(`${this.refreshTokenPepper}:${token}`)
      .digest('hex');
  }

  private expiresAt() {
    return new Date(Date.now() + this.refreshTtlMilliseconds);
  }

  private readPositiveInt(name: string, fallback: number) {
    const value = Number(this.configService.get<string>(name));

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
