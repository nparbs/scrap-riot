FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY server ./server
COPY src ./src
RUN npm run build:server

# The bundle includes its dependencies, so the final image needs only Node and one file.
FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist-server/index.mjs ./index.mjs
ENV NODE_ENV=production
ENV PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "index.mjs"]
