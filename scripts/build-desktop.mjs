import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const releaseTag = process.env.YODA_RELEASE_TAG ?? `v${packageJson.version}`;
const releaseVersion = releaseTag.startsWith('v') ? releaseTag.slice(1) : releaseTag;
const commit = process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/release.json', `${JSON.stringify({
	version: releaseVersion,
	tag: releaseTag,
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
