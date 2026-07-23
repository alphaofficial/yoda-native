import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const target = 'build/yoda-native.db';

mkdirSync(dirname(target), { recursive: true });
rmSync(`${target}-wal`, { force: true });
rmSync(`${target}-shm`, { force: true });

if (!existsSync(target)) {
	closeSync(openSync(target, 'w'));
}

execFileSync('npx', ['mikro-orm', 'migration:up'], {
	stdio: 'inherit',
	env: { ...process.env, DB_PATH: target },
});

execFileSync('npx', ['tsx', 'scripts/setup-dashboard-db.ts'], {
	stdio: 'inherit',
	env: { ...process.env, DB_PATH: target },
});
