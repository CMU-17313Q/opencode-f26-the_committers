// k6 load test for the opencode server.
// CI check owned by Dhabya Almohannadi (Project 3B: testing / dynamic analysis).
//
// The GitHub Actions job (.github/workflows/load-test.yml) starts its own opencode
// server inside the runner and points this script at it. It never touches our
// deployed VM.
//
// Run it locally against a server you started yourself:
//   k6 run -e BASE_URL=http://127.0.0.1:4096 -e PROJECT_DIR="$PWD" load-test/opencode-load.js
import http from "k6/http"
import { check, sleep } from "k6"

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:4096"

// Project-scoped endpoints (/command, /session) need to know which project folder
// to load. The server reads it from this header.
const projectParams = {
  headers: __ENV.PROJECT_DIR ? { "x-opencode-directory": __ENV.PROJECT_DIR } : {},
}

export const options = {
  // 10 simulated users sending requests for 30 seconds.
  vus: 10,
  duration: "30s",
  // The check fails (k6 exits non-zero) if any threshold is not met.
  thresholds: {
    checks: ["rate>0.99"], // more than 99% of checks must pass
    http_req_failed: ["rate<0.01"], // fewer than 1% of requests may fail
  },
}

export default function () {
  // 1. Health endpoint: what every open browser tab of the web UI polls.
  const health = http.get(`${BASE_URL}/global/health`, { tags: { name: "GET /global/health" } })
  check(health, {
    "health: status is 200": (r) => r.status === 200,
    "health: server reports healthy": (r) => String(r.body).includes('"healthy":true'),
  })

  // 2. Command list: includes our Project 2 feature, /suggest-tests.
  const commands = http.get(`${BASE_URL}/command`, {
    ...projectParams,
    tags: { name: "GET /command" },
  })
  check(commands, {
    "commands: status is 200": (r) => r.status === 200,
    "commands: lists suggest-tests": (r) => String(r.body).includes('"suggest-tests"'),
  })

  // 3. Session list: what the web UI loads when a project is opened.
  const sessions = http.get(`${BASE_URL}/session`, {
    ...projectParams,
    tags: { name: "GET /session" },
  })
  check(sessions, {
    "sessions: status is 200": (r) => r.status === 200,
  })

  // Each simulated user pauses 1 second between rounds, like a real client.
  sleep(1)
}
