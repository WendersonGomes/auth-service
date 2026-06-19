import { Controller, Get } from '@nestjs/common';
import { JwtTokenService } from './jwt-token.service.js';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwtTokenService: JwtTokenService) {}

  @Get('jwks.json')
  jwks() {
    return this.jwtTokenService.getJwks();
  }
}
