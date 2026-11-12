import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const port = Number(process.env.CI_SMOKE_PORT ?? 4179);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('CI_SMOKE_PORT must be a valid TCP port.');
}

const baseUrl = `http://127.0.0.1:${port}/`;
const preview = spawn(process.execPath, [
  resolve('node_modules/vite/bin/vite.js'),
  'preview',
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--strictPort',
], { stdio: 'ignore' });
let startupError = null;
preview.on('error', (error) => { startupError = error; });

async function fetchPreview(url) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (startupError) {
      throw new Error(`Unable to start Vite preview: ${startupError.message}`);
    }
    if (preview.exitCode !== null) {
      throw new Error(`Vite preview exited before becoming ready (code ${preview.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Vite preview returned HTTP ${response.status} for ${url}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Vite preview did not become ready: ${lastError instanceof Error ? lastError.message : 'unknown error'}`);
}

try {
  const page = await fetchPreview(baseUrl);
  const html = await page.text();
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('The production page is missing its application root.');
  }

  const scriptTag = [...html.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .find((tag) => /\btype="module"/i.test(tag));
  const scriptUrl = scriptTag?.match(/\bsrc="([^"]+)"/i)?.[1];
  if (!scriptUrl) throw new Error('The production page is missing its application entry module.');

  const bundle = await fetchPreview(new URL(scriptUrl, baseUrl));
  const bundleText = await bundle.text();
  if (!bundleText.includes(packageJson.version)) {
    throw new Error(`The built application bundle does not contain package version ${packageJson.version}.`);
  }

  const stylesheetUrls = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/gi)]
    .map(([tag]) => tag.match(/\bhref="([^"]+)"/i)?.[1])
    .filter((url) => typeof url === 'string');
  for (const stylesheetUrl of stylesheetUrls) {
    await fetchPreview(new URL(stylesheetUrl, baseUrl));
  }

  console.log(`Production preview smoke passed for v${packageJson.version}: app root, JavaScript, and ${stylesheetUrls.length} stylesheet(s) served.`);
} finally {
  if (preview.exitCode === null) preview.kill();
}
