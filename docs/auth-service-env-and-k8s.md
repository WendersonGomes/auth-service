# Variaveis do auth-service e Kubernetes

## Tabela de variaveis

| Variavel esperada pelo codigo | Arquivo onde aparece | Obrigatoria? | Valor exemplo local | Deve ir para Kubernetes Secret? | Observacao |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | `src/infra/prisma/prisma.service.ts` | Sim | `postgresql://user:password@localhost:5432/foodwise_auth` | Sim | String de conexao do Prisma. |
| `SUPABASE_URL` | `src/modules/auth/supabase/supabase-server-client.service.ts` | Sim | `https://project.supabase.co` | Nao, pode ser ConfigMap | URL publica do projeto Supabase. |
| `SUPABASE_ANON_KEY` | `src/modules/auth/supabase/supabase-server-client.service.ts` | Sim | `eyJ...` | Sim | Chave anon/publishable usada no OAuth SSR. |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.example`, `secrets.example.env` | Nao no codigo atual | `eyJ...` | Sim | Reservada para operacoes administrativas futuras; nao usada no fluxo atual. |
| `AUTH_JWT_PRIVATE_KEY_PEM` | `src/modules/auth/tokens/jwt-token.service.ts` | Sim | conteudo de `keys/jwt_private.pem` | Sim, via `--from-file` | Chave privada RSA para assinar RS256. |
| `AUTH_JWT_PUBLIC_KEY_PEM` | `src/modules/auth/tokens/jwt-token.service.ts` | Sim | conteudo de `keys/jwt_public.pem` | Sim, via `--from-file` | Chave publica RSA usada no JWKS e validacao local. |
| `AUTH_JWT_ISSUER` | `src/modules/auth/tokens/jwt-token.service.ts` | Nao, tem default | `food-wise-auth-service` | Nao, pode ser ConfigMap | Deve bater com Envoy/inventory. |
| `AUTH_JWT_AUDIENCE` | `src/modules/auth/tokens/jwt-token.service.ts` | Nao, tem default | `food-wise-api` | Nao, pode ser ConfigMap | Deve bater com Envoy/inventory. |
| `AUTH_JWT_KID` | `src/modules/auth/tokens/jwt-token.service.ts` | Nao, tem default | `food-wise-rs256-1` | Nao, pode ser ConfigMap | Identificador da chave no JWKS. |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | `src/modules/auth/tokens/jwt-token.service.ts` | Nao, tem default | `900` | Nao | TTL do JWT curto. |
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | `src/modules/auth/tokens/refresh-token.service.ts` | Nao, tem default | `30` | Nao | TTL do token opaco de refresh. |
| `AUTH_REFRESH_TOKEN_PEPPER` | `src/modules/auth/tokens/refresh-token.service.ts` | Recomendado | `long-random-secret` | Sim | Segredo adicional para hash do refresh token. |
| `AUTH_ACCESS_TOKEN_COOKIE_NAME` | `src/modules/auth/session/auth-session.service.ts` | Nao, tem default | `fw_access` | Nao | Nome do cookie HTTP-only de access token. |
| `AUTH_REFRESH_TOKEN_COOKIE_NAME` | `src/modules/auth/session/auth-session.service.ts` | Nao, tem default | `fw_refresh` | Nao | Nome do cookie HTTP-only de refresh token. |
| `AUTH_COOKIE_DOMAIN` | `src/modules/auth/session/auth-session.service.ts` | Nao | vazio local, `.example.com` prod | Nao | Defina quando frontend/API compartilham dominio pai. |
| `AUTH_COOKIE_SECURE` | `src/modules/auth/session/auth-session.service.ts` | Nao | `false` local, `true` prod | Nao | Em producao tambem fica seguro por `NODE_ENV=production`. |
| `AUTH_COOKIE_SAME_SITE` | `src/modules/auth/session/auth-session.service.ts` | Nao, tem default | `lax` | Nao | Use `none` somente com HTTPS/cross-site. |
| `FRONTEND_URL` | `src/main.ts`, `src/modules/auth/session/auth-session.service.ts` | Nao, tem default local | `http://localhost:3000` | Nao | Destino pos-login e origem CORS. |
| `API_PUBLIC_URL` | `src/modules/auth/session/auth-session.service.ts` | Sim para OAuth Google | `http://localhost:3002` | Nao | Origem publica do auth-service via Envoy; callback vira `/api/auth/callback`. |
| `NODE_ENV` | `src/modules/auth/session/auth-session.service.ts`, `src/modules/auth/supabase/supabase-server-client.service.ts`, `Dockerfile` | Nao | `development` | Nao | `production` ativa cookies seguros. |
| `PORT` | `src/main.ts` | Nao, tem default | `3002` | Nao | Porta HTTP do NestJS. |
| `SERVICE_NAME` | `src/main.ts`, `src/modules/health/health.controller.ts` | Nao, tem default | `auth-service` | Nao | Usado em logs/health. |

## Secret Kubernetes

Crie um arquivo real `k8s\secrets.env` baseado em `secrets.example.env`, sem incluir as chaves PEM nele. As PEMs devem entrar via `--from-file` para preservar quebras de linha.

```powershell
kubectl create secret generic food-wise-secrets `
  -n food-wise `
  --from-env-file=k8s\secrets.env `
  --from-file=AUTH_JWT_PRIVATE_KEY_PEM=keys\jwt_private.pem `
  --from-file=AUTH_JWT_PUBLIC_KEY_PEM=keys\jwt_public.pem
```

Variaveis minimas para o `auth-service` parar de quebrar por configuracao ausente:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AUTH_JWT_PRIVATE_KEY_PEM`
- `AUTH_JWT_PUBLIC_KEY_PEM`
- `API_PUBLIC_URL`

Para producao, inclua tambem:

- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_REFRESH_TOKEN_PEPPER`
- `AUTH_JWT_ISSUER`
- `AUTH_JWT_AUDIENCE`
- `AUTH_ACCESS_TOKEN_TTL_SECONDS`
- `AUTH_REFRESH_TOKEN_TTL_DAYS`
- `AUTH_ACCESS_TOKEN_COOKIE_NAME`
- `AUTH_REFRESH_TOKEN_COOKIE_NAME`
- `AUTH_COOKIE_DOMAIN`
- `AUTH_COOKIE_SECURE`
- `AUTH_COOKIE_SAME_SITE`
- `FRONTEND_URL`
- `NODE_ENV`

## Checklist final

```powershell
npm run build
node dist/main/src/main.js
docker build -t auth-service:local .
docker run --rm -p 3002:3002 --env-file .env auth-service:local
kubectl apply -f k8s\
kubectl logs -n food-wise deploy/auth-service
curl http://localhost:3002/.well-known/jwks.json
curl -i http://localhost:3002/api/auth/me
```

`GET /api/auth/me` deve retornar `401` sem cookie valido e `200` com `fw_access` valido.
