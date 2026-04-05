FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY server.js ./
COPY index.html ./
COPY public ./public
COPY svelte.config.mjs ./
COPY vite.config.mjs ./
COPY src ./src
COPY data ./data

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data

EXPOSE 3000
EXPOSE 1455

CMD ["npm", "start"]
