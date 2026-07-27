import { build } from 'esbuild';

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
