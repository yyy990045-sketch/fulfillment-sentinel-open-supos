ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG APP_BASE_PATH=/
ENV APP_BASE_PATH=${APP_BASE_PATH}
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm run demo:judge

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3410
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/src ./src
COPY --from=build /app/.preview/judge-demo ./.preview/judge-demo
COPY deploy/demo-seed.json ./deploy/demo-seed.json
COPY deploy/nodered-j2-flow.json ./deploy/nodered-j2-flow.json
COPY deploy/seed-runtime.mjs ./deploy/seed-runtime.mjs
COPY deploy/demo-probe.mjs ./deploy/demo-probe.mjs
COPY deploy/provision-uns.mjs ./deploy/provision-uns.mjs
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY third_party ./third_party
EXPOSE 3410
CMD ["npm", "start"]
