import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { AuthSessionController } from './session/auth-session.controller.js';
import { AuthSessionService } from './session/auth-session.service.js';
import { SupabaseServerClientService } from './supabase/supabase-server-client.service.js';
import { JwksController } from './tokens/jwks.controller.js';
import { JwtTokenService } from './tokens/jwt-token.service.js';
import { RefreshTokenService } from './tokens/refresh-token.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuthSessionController, JwksController],
  providers: [
    AuthService,
    AuthSessionService,
    JwtTokenService,
    RefreshTokenService,
    SupabaseServerClientService,
  ],
  exports: [AuthService, JwtTokenService],
})
export class AuthModule {}
