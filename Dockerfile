FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000
EXPOSE 10000

CMD ["node", "dist/server/entry.mjs"]
