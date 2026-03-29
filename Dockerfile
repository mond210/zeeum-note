FROM node:25.8.2-alpine3.23 AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY server.js ./
COPY index.html ./
COPY svelte.config.mjs ./
COPY vite.config.mjs ./
COPY src ./src
COPY data ./data

RUN npm run build
RUN npm prune --omit=dev

FROM node:25.8.2-alpine3.23

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data

EXPOSE 3000

CMD ["npm", "start"]
