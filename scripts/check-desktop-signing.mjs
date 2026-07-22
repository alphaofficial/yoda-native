import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const requiredEnv = ['APPLE_TEAM_ID', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'CSC_NAME'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
const failures = [];

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    failures.push(error.stderr?.toString().trim() || error.message);
    return '';
  }
}

if (missingEnv.length) {
  failures.push(`Missing environment variables: ${missingEnv.join(', ')}`);
}

if (!fs.existsSync('signing/env.example')) {
  failures.push('Missing signing/env.example');
}

const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']);

if (process.env.CSC_NAME && !identities.includes(process.env.CSC_NAME)) {
  failures.push(`Signing identity not found in keychain: ${process.env.CSC_NAME}`);
}

run('xcrun', ['--find', 'notarytool']);

if (failures.length) {
  console.error('Desktop signing is not ready.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Desktop signing is ready.');
