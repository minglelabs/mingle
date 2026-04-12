#!/usr/bin/env node

import {
  EXPECTED_RN_API_NAMESPACE_BY_OS,
  normalizeNamespace,
} from './rn-api-namespaces.mjs';

const EXPECTED_NAMESPACE = EXPECTED_RN_API_NAMESPACE_BY_OS.android;

const configured = normalizeNamespace(
  process.env.NEXT_PUBLIC_API_NAMESPACE || process.env.RN_API_NAMESPACE || '',
);

if (configured !== EXPECTED_NAMESPACE) {
  console.error(
    `[rn:android] invalid NEXT_PUBLIC_API_NAMESPACE: expected "${EXPECTED_NAMESPACE}", received "${configured || '(empty)'}"`,
  );
  process.exit(1);
}

console.log(`[rn:android] NEXT_PUBLIC_API_NAMESPACE validated: ${configured}`);
