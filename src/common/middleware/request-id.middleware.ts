import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AuthServiceRequest } from '../types/auth-service-request.js';

const REQUEST_ID_HEADER = 'x-request-id';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: AuthServiceRequest,
    response: Response,
    next: NextFunction,
  ) {
    const incomingRequestId = this.getSingleHeader(
      request.headers[REQUEST_ID_HEADER],
    );

    const requestId =
      incomingRequestId && UUID_REGEX.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    request.requestId = requestId;
    request.startedAt = Date.now();
    response.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }

  private getSingleHeader(header: unknown): string | undefined {
    if (typeof header !== 'string') {
      return undefined;
    }

    return header;
  }
}
