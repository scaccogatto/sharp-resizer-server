# Digest-pinned base image, kept current by Dependabot (docker ecosystem)
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js ./
COPY src ./src

# Run as the unprivileged `node` user: it owns the mount points so a fresh
# named volume is writable, while the app code stays root-owned (read-only).
RUN mkdir -p /app/input /app/output && chown node:node /app/input /app/output
USER node

VOLUME ["/app/input", "/app/output"]
EXPOSE 4080

ENTRYPOINT ["node", "index.js"]
CMD ["-i", "input", "-o", "output", "-p", "4080"]
