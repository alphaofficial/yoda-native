import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const source = 'yoda-native.db';
const target = 'build/yoda-native.db';

mkdirSync(dirname(target), { recursive: true });
rmSync(target, { force: true });
rmSync(`${target}-wal`, { force: true });
rmSync(`${target}-shm`, { force: true });
copyFileSync(source, target);

execFileSync('npx', ['mikro-orm', 'migration:up'], {
	stdio: 'inherit',
	env: { ...process.env, DB_PATH: target },
});
