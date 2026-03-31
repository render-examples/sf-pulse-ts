FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "dist/index.cjs"]
