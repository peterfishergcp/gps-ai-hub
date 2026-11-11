# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

FROM node:22-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.mjs ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "index.mjs"]
