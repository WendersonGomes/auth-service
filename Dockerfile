FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci
RUN npx prisma generate
RUN npm prune --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/main/src/main.js"]

