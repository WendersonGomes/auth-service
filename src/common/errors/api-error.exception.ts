import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiErrorCode =
  | 'INTERNAL_AUTH_FAILED'
  | 'VALIDATION_ERROR'
  | 'PROFILE_NOT_FOUND'
  | 'AUTH_DATABASE_UNAVAILABLE'
  | 'AUTH_INTERNAL_ERROR';

export type ApiErrorResponse = {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
};

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  INTERNAL_AUTH_FAILED: 'Chamada interna não autorizada.',
  VALIDATION_ERROR: 'Revise os dados enviados.',
  PROFILE_NOT_FOUND: 'Perfil não encontrado.',
  AUTH_DATABASE_UNAVAILABLE:
    'O serviço de autenticação está temporariamente indisponível.',
  AUTH_INTERNAL_ERROR: 'Não foi possível concluir a solicitação.',
};

export class ApiException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    code: ApiErrorCode,
    details?: unknown,
  ) {
    super(
      {
        statusCode,
        code,
        message: API_ERROR_MESSAGES[code],
        ...(details === undefined ? {} : { details }),
      },
      statusCode,
    );
  }
}

export class InternalAuthFailedException extends ApiException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'INTERNAL_AUTH_FAILED');
  }
}

export class ProfileNotFoundException extends ApiException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'PROFILE_NOT_FOUND');
  }
}

export class AuthDatabaseUnavailableException extends ApiException {
  constructor(details?: unknown) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'AUTH_DATABASE_UNAVAILABLE',
      details,
    );
  }
}
