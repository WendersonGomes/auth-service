import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly serviceName = process.env.SERVICE_NAME;

  constructor(private readonly prisma: PrismaService) {}

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
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: this.serviceName,
        checks: {
          database: 'down',
        },
        timestamp: new Date().toISOString(),
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
