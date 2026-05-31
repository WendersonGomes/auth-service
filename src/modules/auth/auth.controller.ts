import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard.js';
import { AuthService } from './auth.service.js';
import { SyncProfileDto } from './dto/sync-profile.dto.js';

@Controller('internal/auth')
@UseGuards(InternalServiceGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sync')
  syncProfile(@Body() dto: SyncProfileDto) {
    return this.authService.syncProfile(dto);
  }

  @Get('me')
  getMe(@Headers('x-user-id') userId?: string) {
    return this.authService.getMe(userId);
  }
}