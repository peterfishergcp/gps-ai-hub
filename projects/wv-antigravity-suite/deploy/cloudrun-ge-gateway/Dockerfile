FROM node:22-slim
WORKDIR /app
COPY package.json server.mjs ./
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
