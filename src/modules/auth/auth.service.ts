import { BadRequestException, Injectable, NotFoundException, } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SyncProfileDto } from './dto/sync-profile.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncProfile(dto: SyncProfileDto) {
    return this.prisma.profile.upsert({
      where: {
        id: dto.userId,
      },

      update: {
        email: dto.email,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
      },

      create: {
        id: dto.userId,
        email: dto.email,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
      },
    });
  }

  async getMe(userId?: string) {
    this.validateUserId(userId);

    const profile = await this.prisma.profile.findUnique({
      where: {
        id: userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado');
    }

    return profile;
  }

  private validateUserId(
    userId?: string,
  ): asserts userId is string {
    if (!userId) {
      throw new BadRequestException(
        'Header x-user-id ausente',
      );
    }
  }
}