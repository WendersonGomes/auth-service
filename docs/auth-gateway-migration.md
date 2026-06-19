# Migracao de autenticacao para auth-service

## Endpoints publicos

- `GET /api/auth/google`: inicia OAuth Google no Supabase e redireciona o browser.
- `GET /api/auth/google/url`: gera a URL OAuth Google e retorna `{ "url": "https://..." }` para o frontend redirecionar de forma controlada.
- `GET /api/auth/callback`: troca `code` por sessao Supabase, sincroniza `profiles`, emite cookies e redireciona para `FRONTEND_URL`.
- `POST /api/auth/refresh`: valida e rotaciona `fw_refresh`, emite novo `fw_access` e novo `fw_refresh`.
- `POST /api/auth/logout`: revoga o refresh token atual e limpa cookies.
- `GET /api/auth/me`: valida `fw_access` localmente e retorna usuario/perfil.
- `GET /.well-known/jwks.json`: publica a chave RSA publica em JWKS.

## Cookies

- `fw_access`: HTTP-only, `path=/`, JWT RS256 curto. TTL recomendado: 900 segundos.
- `fw_refresh`: HTTP-only, `path=/api/auth`, token opaco aleatorio. TTL recomendado: 30 dias.

Em producao use `AUTH_COOKIE_SECURE=true`. Para frontend e API no mesmo site use `AUTH_COOKIE_SAME_SITE=lax`. Para dominios diferentes, use `sameSite=none`, `secure=true` e configure `AUTH_COOKIE_DOMAIN`.

## Variaveis de ambiente

Veja `.env.example`. As principais:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`
- `API_PUBLIC_URL`
- `AUTH_JWT_PRIVATE_KEY_PEM`
- `AUTH_JWT_PUBLIC_KEY_PEM`
- `AUTH_JWT_KID`
- `AUTH_JWT_ISSUER=food-wise-auth-service`
- `AUTH_JWT_AUDIENCE=food-wise-api`
- `AUTH_ACCESS_TOKEN_TTL_SECONDS=900`
- `AUTH_REFRESH_TOKEN_TTL_DAYS=30`
- `AUTH_REFRESH_TOKEN_PEPPER`
- `AUTH_ACCESS_TOKEN_COOKIE_NAME=fw_access`
- `AUTH_REFRESH_TOKEN_COOKIE_NAME=fw_refresh`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAME_SITE`

Geracao de chave RSA:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' jwt-private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' jwt-public.pem
```

## Supabase redirect URL

No Supabase Dashboard:

1. Authentication > URL Configuration.
2. Adicione em Redirect URLs:
   - local: `http://localhost:3002/api/auth/callback`
   - Kubernetes/Envoy: `https://SEU_DOMINIO/api/auth/callback`
3. Configure `API_PUBLIC_URL` com a origem publica que o browser acessa via Envoy.
4. Configure `FRONTEND_URL` para o dominio do Next.js, por exemplo `https://SEU_DOMINIO`.

## Erros de OAuth Google

- `AUTH_SUPABASE_CONFIG_MISSING`: `SUPABASE_URL` ou `SUPABASE_ANON_KEY` ausente.
- `AUTH_INVALID_REDIRECT_URL`: `API_PUBLIC_URL` ausente ou invalida.
- `AUTH_GOOGLE_OAUTH_URL_FAILED`: Supabase retornou erro ao gerar URL.
- `AUTH_GOOGLE_OAUTH_URL_MISSING`: Supabase nao retornou `data.url`.

## Gateway API / Envoy

Exemplo de roteamento HTTP:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: food-wise-api
spec:
  parentRefs:
    - name: envoy-gateway
  hostnames:
    - app.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api/auth
        - path:
            type: Exact
            value: /.well-known/jwks.json
      backendRefs:
        - name: auth-service
          port: 3002
    - matches:
        - path:
            type: PathPrefix
            value: /api/inventory
      backendRefs:
        - name: inventory-service
          port: 3003
    - matches:
        - path:
            type: PathPrefix
            value: /api/ai
      backendRefs:
        - name: ai-service
          port: 3004
```

Configure a politica JWT do Envoy Gateway para validar:

- JWKS: `https://app.example.com/.well-known/jwks.json` ou URL interna do `auth-service`.
- issuer: `food-wise-auth-service`
- audiences: `food-wise-api`
- token source: cookie `fw_access`

Mesmo com validacao na borda, os servicos de dominio devem validar o JWT localmente para nao confiar apenas no proxy.

## Inventory-service: validacao JWT local

Instalar dependencias no `inventory-service`:

```bash
npm install jose cookie-parser
npm install -D @types/cookie-parser
```

Adicionar cookie parser no `src/main.ts`:

```ts
import cookieParser from 'cookie-parser';

app.use(cookieParser());
```

Criar `src/common/http/request-context.ts` com `user`:

```ts
export type AuthenticatedUser = {
  id: string;
  email: string;
  roles: string[];
};

export type RequestWithContext = Request & {
  requestId?: string;
  startedAt?: number;
  user?: AuthenticatedUser;
};
```

Substituir `InternalServiceGuard` por um guard local:

```ts
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { RequestWithContext } from '../http/request-context.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks = createRemoteJWKSet(
    new URL(process.env.AUTH_JWKS_URL!),
  );

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const token = request.cookies?.fw_access;

    if (typeof token !== 'string' || token.length === 0) {
      throw new AppException(
        ErrorCode.INTERNAL_AUTH_FAILED,
        'Sessao ausente',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: process.env.AUTH_JWT_ISSUER ?? 'food-wise-auth-service',
      audience: process.env.AUTH_JWT_AUDIENCE ?? 'food-wise-api',
    });

    if (!payload.sub || typeof payload.email !== 'string') {
      throw new AppException(
        ErrorCode.INTERNAL_AUTH_FAILED,
        'Token invalido',
        HttpStatus.UNAUTHORIZED,
      );
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === 'string')
        : [],
    };

    return true;
  }
}
```

Atualizar `CurrentUserId` para usar somente `request.user.id`, removendo fallback para `x-user-id`.

Atualizar controllers:

- trocar `@Controller('internal/inventory/items')` por `@Controller('api/inventory/items')`;
- trocar `@UseGuards(InternalServiceGuard)` por `@UseGuards(JwtAuthGuard)`;
- repetir para categories, dashboard e photos.

Variaveis no `inventory-service`:

- `AUTH_JWKS_URL=http://auth-service:3002/.well-known/jwks.json`
- `AUTH_JWT_ISSUER=food-wise-auth-service`
- `AUTH_JWT_AUDIENCE=food-wise-api`

O `jose` mantem cache do JWKS e busca novamente somente quando necessario. Isso evita chamar o auth-service em toda requisicao.

## Arquivos do gateway removiveis apos migracao

- `src/modules/auth/session/auth-session.controller.ts`
- `src/modules/auth/session/auth-session.service.ts`
- `src/modules/auth/session/auth-session.module.ts`
- `src/modules/auth/profile/auth-proxy.controller.ts`
- `src/modules/auth/profile/auth-proxy.service.ts`
- `src/modules/auth/profile/auth-proxy.module.ts`
- `src/infra/supabase/supabase-server-client.service.ts`
- `src/infra/supabase/supabase.module.ts`
- `src/common/guards/supabase-auth.guard.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/infra/internal-headers.ts`
- `src/infra/internal-headers.spec.ts`
- proxy controllers/services de inventory e ai, se o Envoy Gateway assumir `/api/inventory/*` e `/api/ai/*` diretamente.

Tambem remover dependencias do gateway que eram usadas apenas para auth/proxy:

- `@supabase/ssr`
- `@supabase/supabase-js`
- `cookie-parser`
- `axios`
- `form-data`, se usado apenas em proxy de upload

## Checklist manual

1. Aplicar migrations do `auth-service`.
2. Confirmar `GET /.well-known/jwks.json` retornando uma chave `RSA` com `kid` esperado.
3. Acessar `GET /api/auth/google` pelo browser e confirmar redirect para Google/Supabase.
4. Concluir OAuth e confirmar redirect para `FRONTEND_URL`.
5. Confirmar cookies `fw_access` e `fw_refresh` como HTTP-only.
6. Chamar `GET /api/auth/me` e validar retorno de usuario/perfil.
7. Chamar `POST /api/auth/refresh` e confirmar rotacao: cookie refresh muda e token antigo passa a falhar.
8. Chamar `POST /api/auth/logout` e confirmar cookies limpos e refresh revogado.
9. Chamar `/api/inventory/*` com `fw_access` valido e confirmar `req.user.id` usado na autorizacao de dominio.
10. Repetir chamada com JWT expirado, issuer errado, audience errada e assinatura invalida.

## Riscos de seguranca

- Proteger `AUTH_JWT_PRIVATE_KEY_PEM` como segredo Kubernetes; nunca publicar em ConfigMap.
- Rotacionar `AUTH_JWT_KID` junto com chaves e manter chave antiga no JWKS durante janela de transicao, se houver tokens antigos vivos.
- Usar `AUTH_REFRESH_TOKEN_PEPPER` forte; vazamento do banco nao deve permitir uso direto do refresh token.
- Usar HTTPS em producao com `AUTH_COOKIE_SECURE=true`.
- Nao reintroduzir `x-user-id` como fonte de verdade em servicos de dominio.
- Aplicar CSRF protection ou checagem de Origin/Referer em `POST /api/auth/refresh` e `POST /api/auth/logout` se o dominio permitir requests cross-site.
