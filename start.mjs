#!/usr/bin/env node

/**
 * Automaker - Production Mode Launch Script
 *
 * This script runs the application in production mode (no dev server).
 * It builds everything if needed, then prompts the user to choose web or electron mode.
 *
 * SECURITY NOTE: This script uses a restricted fs wrapper that only allows
 * operations within the script's directory (__dirname). This is a standalone
 * launch script that runs before the platform library is available.
 */

import { execSync } from 'child_process';
import fsNative from 'fs';
import http from 'http';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const treeKill = require('tree-kill');
const crossSpawn = require('cross-spawn');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Restricted fs wrapper - only allows operations within __dirname
// =============================================================================

/**
 * Validate that a path is within the script's directory
 * @param {string} targetPath - Path to validate
 * @returns {string} - Resolved path if valid
 * @throws {Error} - If path is outside __dirname
 */
function validateScriptPath(targetPath) {
  const resolved = path.resolve(__dirname, targetPath);
  const normalizedBase = path.resolve(__dirname);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(
      `[start.mjs] Security: Path access denied outside script directory: ${targetPath}`
    );
  }
  return resolved;
}

/**
 * Restricted fs operations - only within script directory
 */
const fs = {
  existsSync(targetPath) {
    const validated = validateScriptPath(targetPath);
    return fsNative.existsSync(validated);
  },
  mkdirSync(targetPath, options) {
    const validated = validateScriptPath(targetPath);
    return fsNative.mkdirSync(validated, options);
  },
  createWriteStream(targetPath) {
    const validated = validateScriptPath(targetPath);
    return fsNative.createWriteStream(validated);
  },
};

// Colors for terminal output (works on modern terminals including Windows)
const colors = {
  green: '\x1b[0;32m',
  blue: '\x1b[0;34m',
  yellow: '\x1b[1;33m',
  red: '\x1b[0;31m',
  reset: '\x1b[0m',
};

const isWindows = process.platform === 'win32';

// Track background processes for cleanup
let serverProcess = null;
let webProcess = null;
let electronProcess = null;

/**
 * Print colored output
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print the header banner
 */
function printHeader() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║        Automaker Production Mode                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
}

/**
 * Execute a command synchronously and return stdout
 */
function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get process IDs using a specific port (cross-platform)
 */
function getProcessesOnPort(port) {
  const pids = new Set();

  if (isWindows) {
    // Windows: Use netstat to find PIDs
    try {
      const output = execCommand(`netstat -ano | findstr :${port}`);
      if (output) {
        const lines = output.split('\n');
        for (const line of lines) {
          // Match lines with LISTENING or ESTABLISHED on our port
          const match = line.match(/:\d+\s+.*?(\d+)\s*$/);
          if (match) {
            const pid = parseInt(match[1], 10);
            if (pid > 0) pids.add(pid);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  } else {
    // Unix: Use lsof
    try {
      const output = execCommand(`lsof -ti:${port}`);
      if (output) {
        output.split('\n').forEach((pid) => {
          const parsed = parseInt(pid.trim(), 10);
          if (parsed > 0) pids.add(parsed);
        });
      }
    } catch {
      // Ignore errors
    }
  }

  return Array.from(pids);
}

/**
 * Kill a process by PID (cross-platform)
 */
function killProcess(pid) {
  try {
    if (isWindows) {
      execCommand(`taskkill /F /PID ${pid}`);
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a port is in use (without killing)
 */
function isPortInUse(port) {
  const pids = getProcessesOnPort(port);
  return pids.length > 0;
}

/**
 * Kill processes on a port and wait for it to be freed
 */
async function killPort(port) {
  const pids = getProcessesOnPort(port);

  if (pids.length === 0) {
    log(`✓ Port ${port} is available`, 'green');
    return true;
  }

  log(`Killing process(es) on port ${port}: ${pids.join(', ')}`, 'yellow');

  for (const pid of pids) {
    killProcess(pid);
  }

  // Wait for port to be freed (max 5 seconds)
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    const remainingPids = getProcessesOnPort(port);
    if (remainingPids.length === 0) {
      log(`✓ Port ${port} is now free`, 'green');
      return true;
    }
  }

  log(`Warning: Port ${port} may still be in use`, 'red');
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the server health endpoint is responding
 */
function checkHealth(port = 3008) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Prompt the user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Run npm command using cross-spawn for Windows compatibility
 */
function runNpm(args, options = {}) {
  const { env, ...restOptions } = options;
  const spawnOptions = {
    stdio: 'inherit',
    cwd: __dirname,
    ...restOptions,
    // Ensure environment variables are properly merged with process.env
    env: {
      ...process.env,
      ...(env || {}),
    },
  };
  // cross-spawn handles Windows .cmd files automatically
  return crossSpawn('npm', args, spawnOptions);
}

/**
 * Run an npm command and wait for completion
 */
function runNpmAndWait(args, options = {}) {
  const child = runNpm(args, options);
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} failed with code ${code}`));
    });
    child.on('error', (err) => reject(err));
  });
}

/**
 * Run npx command using cross-spawn for Windows compatibility
 */
function runNpx(args, options = {}) {
  const { env, ...restOptions } = options;
  const spawnOptions = {
    stdio: 'inherit',
    cwd: __dirname,
    ...restOptions,
    // Ensure environment variables are properly merged with process.env
    env: {
      ...process.env,
      ...(env || {}),
    },
  };
  // cross-spawn handles Windows .cmd files automatically
  return crossSpawn('npx', args, spawnOptions);
}

/**
 * Kill a process tree using tree-kill
 */
function killProcessTree(pid) {
  return new Promise((resolve) => {
    if (!pid) {
      resolve();
      return;
    }
    treeKill(pid, 'SIGTERM', (err) => {
      if (err) {
        // Try force kill if graceful termination fails
        treeKill(pid, 'SIGKILL', () => resolve());
      } else {
        resolve();
      }
    });
  });
}

/**
 * Cleanup function to kill all spawned processes
 */
async function cleanup() {
  console.log('\nCleaning up...');

  const killPromises = [];

  if (serverProcess && !serverProcess.killed && serverProcess.pid) {
    killPromises.push(killProcessTree(serverProcess.pid));
  }

  if (webProcess && !webProcess.killed && webProcess.pid) {
    killPromises.push(killProcessTree(webProcess.pid));
  }

  if (electronProcess && !electronProcess.killed && electronProcess.pid) {
    killPromises.push(killProcessTree(electronProcess.pid));
  }

  await Promise.all(killPromises);
}

/**
 * Check if production builds exist
 */
function checkBuilds() {
  const serverDist = path.join(__dirname, 'apps', 'server', 'dist');
  const uiDist = path.join(__dirname, 'apps', 'ui', 'dist');
  const electronDist = path.join(__dirname, 'apps', 'ui', 'dist-electron', 'main.js');

  return {
    server: fs.existsSync(serverDist),
    ui: fs.existsSync(uiDist),
    electron: fs.existsSync(electronDist),
  };
}

/**
 * Main function
 */
async function main() {
  // Change to script directory
  process.chdir(__dirname);

  printHeader();

  // Check if node_modules exists
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    log('Installing dependencies...', 'blue');
    const install = runNpm(['install'], { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      install.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install failed with code ${code}`));
      });
    });
  }

  // Always build shared packages first to ensure they're up to date
  // (source may have changed even if dist directories exist)
  log('Building shared packages...', 'blue');
  try {
    await runNpmAndWait(['run', 'build:packages'], { stdio: 'inherit' });
    log('✓ Shared packages built', 'green');
  } catch (error) {
    log(`Failed to build shared packages: ${error.message}`, 'red');
    process.exit(1);
  }

  // Always rebuild server to ensure it's in sync with packages
  log('Building server...', 'blue');
  try {
    await runNpmAndWait(['run', 'build'], { stdio: 'inherit', cwd: path.join(__dirname, 'apps', 'server') });
    log('✓ Server built', 'green');
  } catch (error) {
    log(`Failed to build server: ${error.message}`, 'red');
    process.exit(1);
  }

  // Check if UI/Electron builds exist (these are slower, so only build if missing)
  const builds = checkBuilds();

  if (!builds.ui || !builds.electron) {
    log('UI/Electron builds not found. Building...', 'yellow');
    console.log('');

    try {
      // Build UI (includes Electron main process)
      log('Building UI...', 'blue');
      await runNpmAndWait(['run', 'build'], { stdio: 'inherit' });

      log('✓ Build complete!', 'green');
      console.log('');
    } catch (error) {
      log(`Build failed: ${error.message}`, 'red');
      process.exit(1);
    }
  } else {
    log('✓ UI builds found', 'green');
    console.log('');
  }

  // Check for processes on required ports and prompt user
  log('Checking for processes on ports 3007 and 3008...', 'yellow');

  const webPortInUse = isPortInUse(3007);
  const serverPortInUse = isPortInUse(3008);

  let webPort = 3007;
  let serverPort = 3008;
  let corsOriginEnv = process.env.CORS_ORIGIN || '';

  if (webPortInUse || serverPortInUse) {
    console.log('');
    if (webPortInUse) {
      const pids = getProcessesOnPort(3007);
      log(`⚠ Port 3007 is in use by process(es): ${pids.join(', ')}`, 'yellow');
    }
    if (serverPortInUse) {
      const pids = getProcessesOnPort(3008);
      log(`⚠ Port 3008 is in use by process(es): ${pids.join(', ')}`, 'yellow');
    }
    console.log('');

    while (true) {
      const choice = await prompt(
        'What would you like to do? (k)ill processes, (u)se different ports, or (c)ancel: '
      );
      const lowerChoice = choice.toLowerCase();

      if (lowerChoice === 'k' || lowerChoice === 'kill') {
        if (webPortInUse) {
          await killPort(3007);
        } else {
          log(`✓ Port 3007 is available`, 'green');
        }
        if (serverPortInUse) {
          await killPort(3008);
        } else {
          log(`✓ Port 3008 is available`, 'green');
        }
        break;
      } else if (lowerChoice === 'u' || lowerChoice === 'use') {
        // Prompt for new ports
        while (true) {
          const newWebPort = await prompt('Enter web port (default 3007): ');
          const parsedWebPort = newWebPort.trim() ? parseInt(newWebPort.trim(), 10) : 3007;

          if (isNaN(parsedWebPort) || parsedWebPort < 1024 || parsedWebPort > 65535) {
            log('Invalid port. Please enter a number between 1024 and 65535.', 'red');
            continue;
          }

          if (isPortInUse(parsedWebPort)) {
            const pids = getProcessesOnPort(parsedWebPort);
            log(
              `Port ${parsedWebPort} is already in use by process(es): ${pids.join(', ')}`,
              'red'
            );
            const useAnyway = await prompt('Use this port anyway? (y/n): ');
            if (useAnyway.toLowerCase() !== 'y' && useAnyway.toLowerCase() !== 'yes') {
              continue;
            }
          }

          webPort = parsedWebPort;
          break;
        }

        while (true) {
          const newServerPort = await prompt('Enter server port (default 3008): ');
          const parsedServerPort = newServerPort.trim() ? parseInt(newServerPort.trim(), 10) : 3008;

          if (isNaN(parsedServerPort) || parsedServerPort < 1024 || parsedServerPort > 65535) {
            log('Invalid port. Please enter a number between 1024 and 65535.', 'red');
            continue;
          }

          if (parsedServerPort === webPort) {
            log('Server port cannot be the same as web port.', 'red');
            continue;
          }

          if (isPortInUse(parsedServerPort)) {
            const pids = getProcessesOnPort(parsedServerPort);
            log(
              `Port ${parsedServerPort} is already in use by process(es): ${pids.join(', ')}`,
              'red'
            );
            const useAnyway = await prompt('Use this port anyway? (y/n): ');
            if (useAnyway.toLowerCase() !== 'y' && useAnyway.toLowerCase() !== 'yes') {
              continue;
            }
          }

          serverPort = parsedServerPort;
          break;
        }

        log(`Using ports: Web=${webPort}, Server=${serverPort}`, 'blue');
        break;
      } else if (lowerChoice === 'c' || lowerChoice === 'cancel') {
        log('Cancelled.', 'yellow');
        process.exit(0);
      } else {
        log(
          'Invalid choice. Please enter k (kill), u (use different ports), or c (cancel).',
          'red'
        );
      }
    }
  } else {
    log(`✓ Port 3007 is available`, 'green');
    log(`✓ Port 3008 is available`, 'green');
  }

  // Ensure backend CORS allows whichever UI port we ended up using.
  {
    const existing = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .filter((o) => o !== '*');
    const origins = new Set(existing);
    origins.add(`http://localhost:${webPort}`);
    origins.add(`http://127.0.0.1:${webPort}`);
    corsOriginEnv = Array.from(origins).join(',');
  }
  console.log('');

  // Show menu
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Select Application Mode:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  1) Web Application (Browser)');
  console.log('  2) Desktop Application (Electron)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Setup cleanup handlers
  let cleaningUp = false;
  const handleExit = async (signal) => {
    if (cleaningUp) return;
    cleaningUp = true;
    await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));

  // Prompt for choice
  while (true) {
    const choice = await prompt('Enter your choice (1 or 2): ');

    if (choice === '1') {
      console.log('');
      log('Launching Web Application (Production Mode)...', 'blue');

      // Start the backend server in production mode
      log(`Starting backend server on port ${serverPort}...`, 'blue');

      // Create logs directory
      if (!fs.existsSync(path.join(__dirname, 'logs'))) {
        fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
      }

      // Start server in background, showing output in console AND logging to file
      const logStream = fs.createWriteStream(path.join(__dirname, 'logs', 'server.log'));
      serverProcess = runNpm(['run', 'start'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.join(__dirname, 'apps', 'server'),
        env: {
          PORT: String(serverPort),
          CORS_ORIGIN: corsOriginEnv,
        },
      });

      // Pipe to both log file and console
      serverProcess.stdout?.on('data', (data) => {
        process.stdout.write(data);
        logStream.write(data);
      });
      serverProcess.stderr?.on('data', (data) => {
        process.stderr.write(data);
        logStream.write(data);
      });

      log('Waiting for server to be ready...', 'yellow');

      // Wait for server health check
      const maxRetries = 30;
      let serverReady = false;

      for (let i = 0; i < maxRetries; i++) {
        if (await checkHealth(serverPort)) {
          serverReady = true;
          break;
        }
        process.stdout.write('.');
        await sleep(1000);
      }

      console.log('');

      if (!serverReady) {
        log('Error: Server failed to start', 'red');
        console.log('Check logs/server.log for details');
        cleanup();
        process.exit(1);
      }

      log('✓ Server is ready!', 'green');
      log(`Starting web server...`, 'blue');

      // Start vite preview to serve built static files
      webProcess = runNpx(['vite', 'preview', '--port', String(webPort)], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'apps', 'ui'),
        env: {
          VITE_SERVER_URL: `http://localhost:${serverPort}`,
        },
      });

      log(`The application is available at: http://localhost:${webPort}`, 'green');
      console.log('');

      await new Promise((resolve) => {
        webProcess.on('close', resolve);
      });

      break;
    } else if (choice === '2') {
      console.log('');
      log('Launching Desktop Application (Production Mode)...', 'blue');
      log('(Electron will start its own backend server)', 'yellow');
      console.log('');

      // Run electron directly with the built main.js
      const electronMainPath = path.join(__dirname, 'apps', 'ui', 'dist-electron', 'main.js');
      
      if (!fs.existsSync(electronMainPath)) {
        log('Error: Electron main process not built. Run build first.', 'red');
        process.exit(1);
      }

      // Start vite preview to serve built static files for electron
      // (Electron in non-packaged mode needs a server to load from)
      log('Starting static file server...', 'blue');
      webProcess = runNpx(['vite', 'preview', '--port', String(webPort)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.join(__dirname, 'apps', 'ui'),
        env: {
          VITE_SERVER_URL: `http://localhost:${serverPort}`,
        },
      });

      // Wait a moment for vite preview to start
      await sleep(2000);

      // Use electron from node_modules
      electronProcess = runNpx(['electron', electronMainPath], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'apps', 'ui'),
        env: {
          TEST_PORT: String(webPort),
          PORT: String(serverPort),
          VITE_DEV_SERVER_URL: `http://localhost:${webPort}`,
          VITE_SERVER_URL: `http://localhost:${serverPort}`,
          CORS_ORIGIN: corsOriginEnv,
          NODE_ENV: 'production',
        },
      });

      await new Promise((resolve) => {
        electronProcess.on('close', () => {
          // Also kill vite preview when electron closes
          if (webProcess && !webProcess.killed && webProcess.pid) {
            killProcessTree(webProcess.pid);
          }
          resolve();
        });
      });

      break;
    } else {
      log('Invalid choice. Please enter 1 or 2.', 'red');
    }
  }
}

// Run main function
main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
