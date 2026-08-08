FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

FROM base AS development
ENV NODE_ENV=development
RUN npm ci -w backend
COPY backend ./backend
WORKDIR /app/backend
EXPOSE 8080
CMD ["npm", "run", "dev"]

FROM base AS checks
RUN npm ci -w backend
COPY backend ./backend
WORKDIR /app/backend
RUN npm run lint
RUN npm run format:check

FROM base AS builder
RUN npm ci -w backend
COPY backend ./backend
WORKDIR /app/backend
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev -w backend
WORKDIR /app/backend
COPY --chown=node:node --from=builder /app/backend/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
