FROM node:25.8.2-alpine3.23

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
