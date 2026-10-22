import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const children = [];

function cleanup() {
  console.log('\n[NIGHTSHIFT] Shutting down application processes...');
  children.forEach((child) => {
    try {
      if (child && child.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGINT');
        }
      }
    } catch {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function checkHttp(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, name, maxRetries = 40) {
  process.stdout.write(`[NIGHTSHIFT] Waiting for ${name} to be ready...`);
  for (let i = 0; i < maxRetries; i++) {
    const ok = await checkHttp(url);
    if (ok) {
      console.log(` Ready! (${url})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
    process.stdout.write('.');
  }
  console.log(`\n[NIGHTSHIFT] Warning: Timed out waiting for ${name}`);
  return false;
}

async function start() {
  console.log('==================================================');
  console.log('   NIGHTSHIFT — Desktop Voice Chat & Screen Share  ');
  console.log('==================================================\n');

  // 1. Build electron main files and verify build result
  console.log('[NIGHTSHIFT] Compiling Electron main and preload...');
  const tscBuild = spawn('npm', ['run', 'build:electron', '--workspace=@nightshift/desktop'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit',
  });
  const buildExitCode = await new Promise((resolve) => tscBuild.on('close', resolve));
  if (buildExitCode !== 0) {
    console.error(`\n[NIGHTSHIFT] Error: Electron build failed with exit code ${buildExitCode}. Aborting application start.`);
    process.exit(buildExitCode || 1);
  }

  // 2. Check or launch Fastify server (3001)
  const isServerRunning = await checkHttp('http://127.0.0.1:3001/api/health');
  if (!isServerRunning) {
    console.log('[NIGHTSHIFT] Starting server on http://127.0.0.1:3001...');
    const serverProc = spawn('npm', ['run', 'dev', '--workspace=@nightshift/server'], {
      cwd: rootDir,
      shell: true,
      stdio: 'pipe',
    });
    children.push(serverProc);
    serverProc.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg.includes('Server listening')) {
        console.log(`[SERVER] ${msg}`);
      }
    });
    serverProc.stderr.on('data', (d) => console.error(`[SERVER ERR] ${d.toString().trim()}`));
  } else {
    console.log('[NIGHTSHIFT] Fastify server is already running on http://127.0.0.1:3001.');
  }

  // 3. Check or launch Vite dev server (5173)
  const isViteRunning = await checkHttp('http://localhost:5173');
  if (!isViteRunning) {
    console.log('[NIGHTSHIFT] Starting Vite dev server on http://localhost:5173...');
    const viteProc = spawn('npm', ['run', 'dev', '--workspace=@nightshift/desktop'], {
      cwd: rootDir,
      shell: true,
      stdio: 'pipe',
    });
    children.push(viteProc);
  } else {
    console.log('[NIGHTSHIFT] Vite dev server is already running on http://localhost:5173.');
  }

  // 4. Wait for both to be fully responsive
  await waitForUrl('http://127.0.0.1:3001/api/health', 'Backend Server');
  await waitForUrl('http://localhost:5173', 'Vite Client');

  // 5. Launch native Electron Desktop Window directly on the system
  console.log('\n[NIGHTSHIFT] Launching Native Windows Desktop Application...');
  const electronProc = spawn('npm', ['run', 'dev:electron', '--workspace=@nightshift/desktop'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_DEV: 'true',
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  children.push(electronProc);

  electronProc.on('close', (code) => {
    console.log(`[NIGHTSHIFT] Desktop window closed (exit code ${code}).`);
    cleanup();
  });
}

start().catch((err) => {
  console.error('[NIGHTSHIFT] Fatal launch error:', err);
  cleanup();
});
