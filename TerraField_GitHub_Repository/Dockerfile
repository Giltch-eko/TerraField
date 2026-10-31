FROM node:24-bookworm-slim
WORKDIR /app
COPY client ./client
COPY node-server ./node-server
COPY server/data ./server/data
ENV TERRAFIELD_HOST=0.0.0.0 TERRAFIELD_NO_BROWSER=1 DATABASE_PATH=/data/terra.db
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8000
CMD ["node", "node-server/app.js"]
