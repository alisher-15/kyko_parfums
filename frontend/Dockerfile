FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Rewrites (/api, /media -> backend) are resolved at build time.
ARG BACKEND_URL=http://backend:8000
ARG NEXT_PUBLIC_CURRENCY=₸
ARG NEXT_PUBLIC_YM_ID=
ARG NEXT_PUBLIC_GA_ID=
# The site's address for link previews of the pages made at build time (lib/site.ts).
ARG SITE_URL=
ARG RENDER_EXTERNAL_URL=
ENV BACKEND_URL=$BACKEND_URL \
    SITE_URL=$SITE_URL \
    RENDER_EXTERNAL_URL=$RENDER_EXTERNAL_URL \
    NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY \
    NEXT_PUBLIC_YM_ID=$NEXT_PUBLIC_YM_ID \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
