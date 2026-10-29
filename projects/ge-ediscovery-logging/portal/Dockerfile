# Stage 1: Build the React 18 + Vite + Tailwind Compliance Review SPA
FROM node:20-slim AS frontend-builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
RUN npm run build

# Stage 2: Minimal Non-Root Python Runtime serving SPA + BigQuery/GCS API
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir "cryptography>=44.0.0" \
    && groupadd -r portal && useradd -r -g portal -d /app -s /sbin/nologin portal

COPY --from=frontend-builder /build/dist /app/dist
COPY server.py /app/server.py

RUN chown -R portal:portal /app
USER portal

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python3", "/app/server.py"]
