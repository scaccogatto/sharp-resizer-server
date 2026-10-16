# Digest-pinned base image, kept current by Dependabot (docker ecosystem)
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0

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
