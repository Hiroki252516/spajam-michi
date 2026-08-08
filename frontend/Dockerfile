FROM node:22-alpine AS base

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

FROM base AS development
ENV NODE_ENV=development
RUN npm ci -w frontend

COPY frontend ./frontend
WORKDIR /app/frontend
EXPOSE 8081
CMD ["npm", "start"]

FROM base AS checks
RUN npm ci -w frontend
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run lint
RUN npm run format:check
RUN npm run typecheck
