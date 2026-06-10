import { Controller, Get, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthDatabaseUnavailableException } from '../../common/errors/api-error.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly serviceName: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.serviceName = configService.get<string>(
      'SERVICE_NAME',
      'auth-service',
    );
  }

  @Get('liveness')
  @HttpCode(200)
  liveness() {
    return {
      status: 'ok',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @HttpCode(200)
  async readiness() {
    try {
      await this.prisma.$queryRaw`
        SELECT 1
      `;
    } catch {
      throw new AuthDatabaseUnavailableException({
        checks: {
          database: 'down',
        },
      });
    }

    return {
      status: 'ready',
      service: this.serviceName,
      checks: {
        database: 'up',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
