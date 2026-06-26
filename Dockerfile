FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
