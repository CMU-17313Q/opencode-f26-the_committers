# Dockerfile for the team's opencode fork (CMU-17313Q/opencode based)
# Put this file in the ROOT of your repository (next to package.json) and commit it.
 
# ---------- Stage 1: build opencode + your team's web UI into one binary ----------
# node:24-bookworm already has git, python3, make and g++ (needed for native
# modules during `bun install`); the repo's own CI also uses Node 24.
FROM node:24-bookworm AS build
 
# Must match "packageManager" in the root package.json (currently bun@1.3.14).
RUN npm install -g bun@1.3.14
 
WORKDIR /src
COPY . .
 
# HUSKY=0           -> skip git-hook setup (.git is not copied into the image)
# OPENCODE_CHANNEL  -> stops the build script from calling `git branch`
ENV HUSKY=0 \
    OPENCODE_CHANNEL=prod
 
RUN bun install
 
# Builds packages/app (the web UI) and embeds it in the opencode binary,
# so the site serves YOUR team's UI instead of proxying app.opencode.ai.
RUN bun run --cwd packages/opencode build --single --skip-install
 
# ---------- Stage 2: small runtime image ----------
FROM debian:bookworm-slim
 
# ca-certificates: HTTPS to model providers; git + ripgrep: used by opencode's tools
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
 && rm -rf /var/lib/apt/lists/*
 
COPY --from=build /src/packages/opencode/dist/opencode-linux-*/bin/opencode /usr/local/bin/opencode
 
WORKDIR /workspace
EXPOSE 4096
 
# 0.0.0.0 is required INSIDE the container so Docker's port mapping can reach it.
# The host side stays private because docker-compose binds 127.0.0.1:4096.
# `serve` serves the same web UI as `web`, without trying to open a browser.
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]