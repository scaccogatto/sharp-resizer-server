FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY src ./src

VOLUME ["/app/input", "/app/output"]
EXPOSE 4080

ENTRYPOINT ["node", "index.js"]
CMD ["-i", "input", "-o", "output", "-p", "4080"]
