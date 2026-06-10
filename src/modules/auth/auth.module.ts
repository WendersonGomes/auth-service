import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, InternalServiceGuard],
  exports: [AuthService],
})
export class AuthModule {}
