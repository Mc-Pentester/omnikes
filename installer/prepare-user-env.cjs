/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const home = path.resolve(__dirname, '..');
const app = path.join(home, 'app');
const appNext = path.join(app, '.next');
const dataDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'OmniKes');
const userNext = path.join(dataDir, '.next');

function exists(file) { return fs.existsSync(file); }

function copyDirectory(src, dest) {
  if (!exists(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Create user data directory
if (!exists(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create logs directory
const logsDir = path.join(dataDir, 'logs');
if (!exists(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// If .next doesn't exist in user directory, copy from app directory
if (!exists(userNext)) {
  if (exists(appNext)) {
    console.log('Copying .next directory to user-writable location...');
    copyDirectory(appNext, userNext);
    console.log('User environment prepared successfully.');
  } else {
    throw new Error('Application .next directory not found. Please reinstall OmniKes.');
  }
}

// Update .env to point to user .next directory
const envPath = path.join(app, '.env');
if (exists(envPath)) {
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (!envContent.includes('NEXT_CACHE_DIR')) {
    envContent += `\nNEXT_CACHE_DIR=${userNext}\n`;
    fs.writeFileSync(envPath, envContent);
  }
}

console.log('User environment preparation: PASS');
