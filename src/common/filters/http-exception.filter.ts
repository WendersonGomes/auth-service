import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  API_ERROR_MESSAGES,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '../errors/api-error.exception.js';
import type { AuthServiceRequest } from '../types/auth-service-request.js';

type PublicError = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly serviceName: string) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<AuthServiceRequest>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const publicError = this.toPublicError(exception, statusCode);
    const body: ApiErrorResponse = {
      statusCode,
      code: publicError.code,
      message: publicError.message,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(publicError.details === undefined
        ? {}
        : { details: publicError.details }),
    };

    this.logError(request, statusCode, publicError.code);

    response.status(statusCode).json(body);
  }

  private toPublicError(
    exception: unknown,
    statusCode: number,
  ): PublicError {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (this.isRecord(exceptionResponse)) {
        const code = this.toApiErrorCode(exceptionResponse.code);

        if (code) {
          return {
            code,
            message: API_ERROR_MESSAGES[code],
            details: this.sanitizeDetails(exceptionResponse.details),
          };
        }
      }
    }

    if (statusCode === HttpStatus.BAD_REQUEST) {
      return {
        code: 'VALIDATION_ERROR',
        message: API_ERROR_MESSAGES.VALIDATION_ERROR,
      };
    }

    if (statusCode === HttpStatus.UNAUTHORIZED) {
      return {
        code: 'INTERNAL_AUTH_FAILED',
        message: API_ERROR_MESSAGES.INTERNAL_AUTH_FAILED,
      };
    }

    if (statusCode === HttpStatus.NOT_FOUND) {
      return {
        code: 'PROFILE_NOT_FOUND',
        message: API_ERROR_MESSAGES.PROFILE_NOT_FOUND,
      };
    }

    if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
      return {
        code: 'AUTH_DATABASE_UNAVAILABLE',
        message: API_ERROR_MESSAGES.AUTH_DATABASE_UNAVAILABLE,
      };
    }

    return {
      code: 'AUTH_INTERNAL_ERROR',
      message: API_ERROR_MESSAGES.AUTH_INTERNAL_ERROR,
    };
  }

  private sanitizeDetails(details: unknown): unknown {
    if (!this.isRecord(details)) {
      return undefined;
    }

    if (this.isRecord(details.checks)) {
      return {
        checks: Object.fromEntries(
          Object.entries(details.checks).filter(
            ([key, value]) =>
              typeof key === 'string' && typeof value === 'string',
          ),
        ),
      };
    }

    return undefined;
  }

  private logError(
    request: AuthServiceRequest,
    statusCode: number,
    errorCode: ApiErrorCode,
  ) {
    const occurredAt = new Date().toISOString();
    const durationMs =
      typeof request.startedAt === 'number'
        ? Date.now() - request.startedAt
        : undefined;
    const userId =
      typeof request.internalUserId === 'string' &&
      UUID_REGEX.test(request.internalUserId)
        ? request.internalUserId
        : undefined;

    const logPayload = {
      service: this.serviceName,
      requestId: request.requestId,
      route: this.routeWithoutQuery(request),
      method: request.method,
      statusCode,
      errorCode,
      durationMs,
      ...(userId ? { userId } : {}),
      occurredAt,
    };

    const message = JSON.stringify(logPayload);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(message);
      return;
    }

    this.logger.warn(message);
  }

  private routeWithoutQuery(request: AuthServiceRequest): string {
    const route = request.originalUrl ?? request.url ?? '';

    return route.split('?')[0] ?? '';
  }

  private toApiErrorCode(code: unknown): ApiErrorCode | undefined {
    if (
      code === 'INTERNAL_AUTH_FAILED' ||
      code === 'VALIDATION_ERROR' ||
      code === 'PROFILE_NOT_FOUND' ||
      code === 'AUTH_DATABASE_UNAVAILABLE' ||
      code === 'AUTH_INTERNAL_ERROR'
    ) {
      return code;
    }

    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
