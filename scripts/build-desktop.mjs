import { build } from 'esbuild';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const tag = process.env.YODA_RELEASE_TAG ?? `v${packageJson.version}`;

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/release.json', `${JSON.stringify({
	version: tag.startsWith('v') ? tag.slice(1) : tag,
	tag,
	commit,
	builtAt: new Date().toISOString(),
}, null, 2)}\n`);

await build({
	entryPoints: {
		main: 'src/desktop/main.ts',
		preload: 'src/desktop/preload.ts',
	},
	outdir: 'dist/desktop',
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	external: [
		'electron',
		'@mikro-orm/core',
		'@mikro-orm/knex',
		'@mikro-orm/postgresql',
		'@mikro-orm/sqlite',
		'@mikro-orm/migrations',
		'bcrypt',
		'better-sqlite3',
		'node-cron',
	],
	sourcemap: true,
});
