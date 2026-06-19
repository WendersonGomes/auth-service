import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiErrorCode =
  | 'INTERNAL_AUTH_FAILED'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_SUPABASE_CONFIG_MISSING'
  | 'AUTH_GOOGLE_OAUTH_URL_FAILED'
  | 'AUTH_GOOGLE_OAUTH_URL_MISSING'
  | 'AUTH_INVALID_REDIRECT_URL'
  | 'AUTH_OAUTH_CODE_EXCHANGE_FAILED'
  | 'AUTH_OAUTH_SESSION_MISSING'
  | 'AUTH_EMAIL_MISSING'
  | 'AUTH_TOKEN_ISSUE_FAILED'
  | 'AUTH_REFRESH_TOKEN_FAILED'
  | 'ROUTE_NOT_FOUND'
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
  INTERNAL_AUTH_FAILED: 'Chamada interna nao autorizada.',
  AUTH_UNAUTHORIZED: 'Sessao invalida ou expirada.',
  AUTH_SUPABASE_CONFIG_MISSING:
    'Configuracao do provedor de autenticacao ausente.',
  AUTH_GOOGLE_OAUTH_URL_FAILED:
    'Nao foi possivel iniciar login com Google.',
  AUTH_GOOGLE_OAUTH_URL_MISSING:
    'Provedor de autenticacao nao retornou URL de login.',
  AUTH_INVALID_REDIRECT_URL: 'URL publica de callback invalida.',
  AUTH_OAUTH_CODE_EXCHANGE_FAILED: 'Nao foi possivel concluir login OAuth.',
  AUTH_OAUTH_SESSION_MISSING: 'Sessao OAuth nao retornada.',
  AUTH_EMAIL_MISSING: 'Conta OAuth sem email.',
  AUTH_TOKEN_ISSUE_FAILED: 'Nao foi possivel emitir token de acesso.',
  AUTH_REFRESH_TOKEN_FAILED: 'Nao foi possivel criar token de refresh.',
  ROUTE_NOT_FOUND: 'Rota nao encontrada.',
  VALIDATION_ERROR: 'Revise os dados enviados.',
  PROFILE_NOT_FOUND: 'Perfil nao encontrado.',
  AUTH_DATABASE_UNAVAILABLE:
    'O servico de autenticacao esta temporariamente indisponivel.',
  AUTH_INTERNAL_ERROR: 'Nao foi possivel concluir a solicitacao.',
};

export class ApiException extends HttpException {
  constructor(statusCode: HttpStatus, code: ApiErrorCode, details?: unknown) {
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

export class AuthUnauthorizedException extends ApiException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'AUTH_UNAUTHORIZED');
  }
}

export class AuthSupabaseConfigMissingException extends ApiException {
  constructor(details?: unknown) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'AUTH_SUPABASE_CONFIG_MISSING',
      details,
    );
  }
}

export class AuthGoogleOAuthUrlFailedException extends ApiException {
  constructor(details?: unknown) {
    super(
      HttpStatus.BAD_GATEWAY,
      'AUTH_GOOGLE_OAUTH_URL_FAILED',
      details,
    );
  }
}

export class AuthGoogleOAuthUrlMissingException extends ApiException {
  constructor(details?: unknown) {
    super(
      HttpStatus.BAD_GATEWAY,
      'AUTH_GOOGLE_OAUTH_URL_MISSING',
      details,
    );
  }
}

export class AuthInvalidRedirectUrlException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, 'AUTH_INVALID_REDIRECT_URL', details);
  }
}

export class AuthOAuthCodeExchangeFailedException extends ApiException {
  constructor(details?: unknown) {
    super(
      HttpStatus.UNAUTHORIZED,
      'AUTH_OAUTH_CODE_EXCHANGE_FAILED',
      details,
    );
  }
}

export class AuthOAuthSessionMissingException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.UNAUTHORIZED, 'AUTH_OAUTH_SESSION_MISSING', details);
  }
}

export class AuthEmailMissingException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.UNAUTHORIZED, 'AUTH_EMAIL_MISSING', details);
  }
}

export class AuthTokenIssueFailedException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, 'AUTH_TOKEN_ISSUE_FAILED', details);
  }
}

export class AuthRefreshTokenFailedException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, 'AUTH_REFRESH_TOKEN_FAILED', details);
  }
}

export class ProfileNotFoundException extends ApiException {
  constructor() {
    super(HttpStatus.NOT_FOUND, 'PROFILE_NOT_FOUND');
  }
}

export class AuthDatabaseUnavailableException extends ApiException {
  constructor(details?: unknown) {
    super(HttpStatus.SERVICE_UNAVAILABLE, 'AUTH_DATABASE_UNAVAILABLE', details);
  }
}
