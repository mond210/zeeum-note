FROM node:25.8.2-alpine3.23

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public
COPY data ./data

EXPOSE 3000

CMD ["npm", "start"]
