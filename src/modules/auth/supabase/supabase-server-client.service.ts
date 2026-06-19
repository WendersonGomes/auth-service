import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServerClient } from '@supabase/ssr';
import type { Request, Response } from 'express';
import { AuthSupabaseConfigMissingException } from '../../../common/errors/api-error.exception.js';

type CreateOptions = {
  writeSupabaseCookies?: boolean;
};

@Injectable()
export class SupabaseServerClientService {
  constructor(private readonly configService: ConfigService) {}

  create(req: Request, res: Response, options: CreateOptions = {}) {
    return createServerClient(
      this.getRequiredConfig('SUPABASE_URL'),
      this.getRequiredConfig('SUPABASE_ANON_KEY'),
      {
        cookies: {
          getAll() {
            return Object.entries(req.cookies ?? {}).map(([name, value]) => ({
              name,
              value: String(value),
            }));
          },

          setAll(cookiesToSet) {
            if (!options.writeSupabaseCookies) {
              return;
            }

            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              res.cookie(name, value, {
                ...cookieOptions,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              });
            });
          },
        },
      },
    );
  }

  clearSupabaseCookies(req: Request, res: Response) {
    const cookieNames = new Set(
      Object.keys(req.cookies ?? {}).filter((name) => name.startsWith('sb-')),
    );
    const projectRef = this.projectRef();

    if (projectRef) {
      cookieNames.add(`sb-${projectRef}-auth-token`);
      cookieNames.add(`sb-${projectRef}-auth-token-code-verifier`);
    }

    cookieNames.forEach((name) => {
      res.clearCookie(name, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    });
  }

  private projectRef() {
    try {
      const url = new URL(
        this.getRequiredConfig('SUPABASE_URL'),
      );

      return url.hostname.split('.')[0];
    } catch {
      return undefined;
    }
  }

  private getRequiredConfig(name: string) {
    const value = this.configService.get<string>(name);

    if (!value || value.trim().length === 0) {
      throw new AuthSupabaseConfigMissingException({
        missingVariable: name,
      });
    }

    return value;
  }
}
