import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard.js';
import type { AuthServiceRequest } from '../../common/types/auth-service-request.js';
import { AuthService } from './auth.service.js';
import { SyncProfileDto } from './dto/sync-profile.dto.js';

@Controller('internal/auth')
@UseGuards(InternalServiceGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  syncProfile(
    @Body() dto: SyncProfileDto,
    @Req() request: AuthServiceRequest,
  ) {
    return this.authService.syncProfile({
      ...dto,
      userId: this.getInternalUserId(request),
      email: this.getInternalUserEmail(request),
    });
  }

  @Get('me')
  getMe(@Req() request: AuthServiceRequest) {
    return this.authService.getMe(this.getInternalUserId(request));
  }

  private getInternalUserId(request: AuthServiceRequest): string {
    if (!request.internalUserId) {
      throw new BadRequestException('Header x-user-id invalido');
    }

    return request.internalUserId;
  }

  private getInternalUserEmail(request: AuthServiceRequest): string {
    const email = request.internalUserEmail;

    if (!email || !isEmail(email)) {
      throw new BadRequestException('Header x-user-email invalido');
    }

    return email;
  }
}
