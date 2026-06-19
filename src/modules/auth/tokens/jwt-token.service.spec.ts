import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from './jwt-token.service.js';

describe('JwtTokenService', () => {
  let service: JwtTokenService;

  beforeEach(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const values = new Map<string, string>([
      ['AUTH_JWT_PRIVATE_KEY_PEM', privateKeyPem],
      ['AUTH_JWT_PUBLIC_KEY_PEM', publicKeyPem],
      ['AUTH_JWT_ISSUER', 'food-wise-auth-service'],
      ['AUTH_JWT_AUDIENCE', 'food-wise-api'],
      ['AUTH_JWT_KID', 'test-key'],
      ['AUTH_ACCESS_TOKEN_TTL_SECONDS', '900'],
    ]);

    const configService = {
      get: (key: string, fallback?: string) => values.get(key) ?? fallback,
      getOrThrow: (key: string) => {
        const value = values.get(key);

        if (!value) {
          throw new Error(`${key} is required`);
        }

        return value;
      },
    } as ConfigService;

    service = new JwtTokenService(configService);
  });

  it('signs and verifies an RS256 access token', async () => {
    const token = await service.signAccessToken({
      id: '4a19d80d-93a8-4f2a-90ef-4653db4557d5',
      email: 'user@example.com',
      roles: ['user'],
    });

    await expect(service.verifyAccessToken(token)).resolves.toEqual({
      id: '4a19d80d-93a8-4f2a-90ef-4653db4557d5',
      email: 'user@example.com',
      roles: ['user'],
    });
  });

  it('exports a JWKS public key with the configured kid', async () => {
    await expect(service.getJwks()).resolves.toMatchObject({
      keys: [
        {
          alg: 'RS256',
          kid: 'test-key',
          kty: 'RSA',
          use: 'sig',
        },
      ],
    });
  });
});
