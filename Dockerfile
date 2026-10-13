# Digest-pinned base image, kept current by Dependabot (docker ecosystem)
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

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
