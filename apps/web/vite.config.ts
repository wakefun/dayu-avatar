import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiPort = normalizePort(process.env.PORT ?? readRootEnvValue('PORT'));
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/static': apiTarget,
    },
  },
});

function normalizePort(value: string | null | undefined) {
  const port = Number(value?.trim() || '3001');
  return Number.isInteger(port) && port > 0 && port <= 65535 ? String(port) : '3001';
}

function readRootEnvValue(key: string) {
  let contents: string;
  try {
    contents = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return null;
  }

  for (const rawLine of contents.replace(/^﻿/, '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex <= 0 || rawLine.slice(0, separatorIndex).trim() !== key) {
      continue;
    }

    return parseEnvValue(rawLine.slice(separatorIndex + 1).trim()) || null;
  }
  return null;
}

function parseEnvValue(rawValue: string) {
  if (!rawValue) {
    return '';
  }

  const quote = rawValue[0];
  if (quote === '"' || quote === "'") {
    const closingQuoteIndex = rawValue.indexOf(quote, 1);
    if (closingQuoteIndex > 0) {
      return rawValue.slice(1, closingQuoteIndex);
    }
  }

  const commentIndex = rawValue.indexOf(' #');
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}
