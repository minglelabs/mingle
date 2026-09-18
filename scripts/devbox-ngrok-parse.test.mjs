import test from "node:test";
import assert from "node:assert/strict";

import { parseNgrokTunnels } from "./devbox-ngrok-parse.mjs";

test("selects devbox_web/devbox_stt/devbox_messaging tunnels that match expected ports and https", () => {
  const payload = {
    tunnels: [
      {
        name: "devbox_web",
        public_url: "https://wrong-port.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3000" },
      },
      {
        name: "devbox_web",
        public_url: "https://right-web.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3509" },
      },
      {
        name: "devbox_stt",
        public_url: "https://right-stt.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:5509" },
      },
      {
        name: "devbox_messaging",
        public_url: "https://right-messaging.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:7509" },
      },
    ],
  };

  const result = parseNgrokTunnels(payload, {
    expectedWebPort: 3509,
    expectedSttPort: 5509,
    expectedMessagingPort: 7509,
    requireHttps: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.webUrl, "https://right-web.ngrok-free.app");
  assert.equal(result.sttUrl, "https://right-stt.ngrok-free.app");
  assert.equal(result.messagingUrl, "https://right-messaging.ngrok-free.app");
});

test("remains backward compatible with legacy web/stt/messaging tunnel names", () => {
  const payload = {
    tunnels: [
      {
        name: "web",
        public_url: "https://legacy-web.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3509" },
      },
      {
        name: "stt",
        public_url: "https://legacy-stt.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:5509" },
      },
      {
        name: "messaging",
        public_url: "https://legacy-messaging.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:7509" },
      },
    ],
  };

  const result = parseNgrokTunnels(payload, {
    expectedWebPort: 3509,
    expectedSttPort: 5509,
    expectedMessagingPort: 7509,
    requireHttps: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.webUrl, "https://legacy-web.ngrok-free.app");
  assert.equal(result.sttUrl, "https://legacy-stt.ngrok-free.app");
  assert.equal(result.messagingUrl, "https://legacy-messaging.ngrok-free.app");
});

test("fails when expected ports do not match tunnel addr", () => {
  const payload = {
    tunnels: [
      {
        name: "devbox_web",
        public_url: "https://web.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3000" },
      },
      {
        name: "devbox_stt",
        public_url: "https://stt.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3001" },
      },
      {
        name: "devbox_messaging",
        public_url: "https://messaging.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3002" },
      },
    ],
  };

  const result = parseNgrokTunnels(payload, {
    expectedWebPort: 3509,
    expectedSttPort: 5509,
    expectedMessagingPort: 7509,
    requireHttps: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /required ngrok tunnels not found/);
});

test("fails when requireHttps is true but tunnel proto/url is http", () => {
  const payload = {
    tunnels: [
      {
        name: "devbox_web",
        public_url: "http://web.ngrok-free.app",
        proto: "http",
        config: { addr: "http://localhost:3509" },
      },
      {
        name: "devbox_stt",
        public_url: "http://stt.ngrok-free.app",
        proto: "http",
        config: { addr: "http://localhost:5509" },
      },
      {
        name: "devbox_messaging",
        public_url: "http://messaging.ngrok-free.app",
        proto: "http",
        config: { addr: "http://localhost:7509" },
      },
    ],
  };

  const result = parseNgrokTunnels(payload, {
    expectedWebPort: 3509,
    expectedSttPort: 5509,
    expectedMessagingPort: 7509,
    requireHttps: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /required ngrok tunnels not found/);
});
