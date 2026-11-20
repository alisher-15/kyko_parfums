# All-in-one image for simple hosting (Render, Railway, Fly.io…): Next.js serves the site on $PORT
# and proxies /api and /media to FastAPI running inside the same container on 127.0.0.1:8000.
# For docker compose the separate backend/ and frontend/ images are used instead.

FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Render passes the service's env vars as build args; these are baked into the build.
ARG NEXT_PUBLIC_CURRENCY=₸
ARG NEXT_PUBLIC_YM_ID=
ARG NEXT_PUBLIC_GA_ID=
# The site's address for link previews of the pages made at build time (lib/site.ts).
ARG SITE_URL=
ARG RENDER_EXTERNAL_URL=
ENV BACKEND_URL=http://127.0.0.1:8000 \
    SITE_URL=$SITE_URL \
    RENDER_EXTERNAL_URL=$RENDER_EXTERNAL_URL \
    NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY \
    NEXT_PUBLIC_YM_ID=$NEXT_PUBLIC_YM_ID \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000

WORKDIR /app/backend
COPY backend/requirements.txt .
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt
ENV PATH=/opt/venv/bin:$PATH
COPY backend/ .
RUN mkdir -p media

WORKDIR /app/frontend
COPY --from=frontend /app/.next/standalone ./
COPY --from=frontend /app/.next/static ./.next/static
COPY --from=frontend /app/public ./public

COPY deploy/start.sh /app/start.sh
EXPOSE 10000
CMD ["sh", "/app/start.sh"]
