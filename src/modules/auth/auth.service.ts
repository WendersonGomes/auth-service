import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuthDatabaseUnavailableException,
  ProfileNotFoundException,
} from '../../common/errors/api-error.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SyncProfileDto } from './dto/sync-profile.dto.js';

type SyncProfileInput = SyncProfileDto & {
  userId: string;
  email: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncProfile(input: SyncProfileInput) {
    this.validateUserId(input.userId);

    try {
      return await this.prisma.profile.upsert({
        where: {
          id: input.userId,
        },

        update: {
          email: input.email,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
        },

        create: {
          id: input.userId,
          email: input.email,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
        },
      });
    } catch {
      throw new AuthDatabaseUnavailableException();
    }
  }

  async getMe(userId: string) {
    this.validateUserId(userId);

    let profile;

    try {
      profile = await this.prisma.profile.findUnique({
        where: {
          id: userId,
        },
      });
    } catch {
      throw new AuthDatabaseUnavailableException();
    }

    if (!profile) {
      throw new ProfileNotFoundException();
    }

    return profile;
  }

  private validateUserId(userId?: string): asserts userId is string {
    if (!userId || !UUID_REGEX.test(userId)) {
      throw new BadRequestException('Header x-user-id invalido');
    }
  }
}
