import type { Request } from 'express';

export type AuthServiceRequest = Request & {
  requestId?: string;
  startedAt?: number;
  internalUserId?: string;
  internalUserEmail?: string;
};
