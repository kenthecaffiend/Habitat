FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npm rebuild esbuild
COPY src ./src
COPY public ./public
COPY ops/documents/outcomes.ts ./ops/documents/outcomes.ts
COPY ops/deploy/policy.mjs ops/deploy/actual-policy.mjs ops/deploy/worker-policy.mjs ./ops/deploy/
COPY ops/deploy/bootstrap-actual.ts ops/deploy/seed-preview.ts ops/deploy/prepare-preview-receipts.ts ./ops/deploy/
COPY tsconfig.json postcss.config.mjs ./
RUN npm run build
RUN node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["ops/deploy/seed-preview.ts"],outfile:"/tmp/seed-preview.mjs",bundle:true,platform:"node",format:"esm",packages:"external",target:"node24"});'
RUN node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["ops/deploy/prepare-preview-receipts.ts"],outfile:"/tmp/prepare-preview-receipts.mjs",bundle:true,platform:"node",format:"esm",packages:"external",target:"node24"});'

RUN node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["ops/deploy/bootstrap-actual.ts"],outfile:"/tmp/bootstrap-actual.mjs",bundle:true,platform:"node",format:"esm",packages:"external",target:"node24"});'

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=501:20 /app/node_modules ./node_modules
COPY --from=build --chown=501:20 /app/.next ./.next
COPY --from=build --chown=501:20 /app/public ./public
COPY --chown=501:20 package.json ./
COPY --chown=501:20 ops/documents/validate-upload.mjs ./ops/documents/
COPY --chown=501:20 ops/deploy/web.mjs ops/deploy/actual-policy.mjs ops/deploy/policy.mjs ./ops/deploy/
COPY --chown=501:20 ops/deploy/preview-web.mjs ./ops/deploy/
COPY --from=build --chown=501:20 /tmp/seed-preview.mjs ./ops/deploy/seed-preview.mjs
COPY --from=build --chown=501:20 /tmp/prepare-preview-receipts.mjs ./ops/deploy/prepare-preview-receipts.mjs
COPY --from=build --chown=501:20 /tmp/bootstrap-actual.mjs ./ops/deploy/bootstrap-actual.mjs
USER 501:20
CMD ["node","ops/deploy/web.mjs"]
