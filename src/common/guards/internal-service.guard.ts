import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const token = request.headers['x-internal-service-token'];

    if (token !== process.env.INTERNAL_SERVICE_TOKEN) {
      throw new UnauthorizedException('Chamada interna não autorizada');
    }

    return true;
  }
}