FROM node:24-bookworm AS build

RUN npm install -g bun@1.3.14 \
 && cp "$(readlink -f "$(command -v bun)")" /usr/local/bin/bun-standalone \
 && /usr/local/bin/bun-standalone --version

WORKDIR /src
COPY . .

ENV HUSKY=0 \
    OPENCODE_CHANNEL=prod

RUN bun install

RUN OPENCODE_VERSION="$(node -p "require('./packages/opencode/package.json').version")" \
    bun run --cwd packages/opencode build --single --skip-install

FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git ripgrep \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/packages/opencode/dist/opencode-linux-*/bin/opencode /usr/local/bin/opencode

COPY --from=build /usr/local/bin/bun-standalone /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx && bun --version && opencode --version

RUN mkdir -p /root/demo/suggest/src /root/demo/suggest/test/generated /root/demo/logging \
 && printf '%s\n' \
    'export function add(a: number, b: number): number {' \
    '  return a + b' \
    '}' \
    '' \
    'export function divide(a: number, b: number): number {' \
    '  if (b === 0) throw new Error("cannot divide by zero")' \
    '  return a / b' \
    '}' > /root/demo/suggest/src/math.ts \
 && for d in /root/demo/suggest /root/demo/logging; do \
      git -C "$d" init -q \
      && git -C "$d" -c user.name=demo -c user.email=demo@example.com commit -q --allow-empty -m init; \
    done

WORKDIR /workspace
EXPOSE 4096

CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]