import 'dotenv-defaults/config';

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { MikroORM } from '@mikro-orm/core';
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';

import { applyPendingDatabaseBackupRestore } from '@/core/backup';
import ormConfig from '@/database/orm.config';
import type { DesktopUpdateCheckResult } from '@/desktop/types';
import { createDashboardRepository } from '@/repositories/DashboardRepository';
import type { RunningHttpServer } from '@/runtime/startHttpServer';
import { startHttpServer } from '@/runtime/startHttpServer';

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningHttpServer | null = null;
let isQuitting = false;
const githubLatestReleaseUrl = 'https://api.github.com/repos/alphaofficial/yoda-native/releases/latest';

type StartupTheme = 'light' | 'dark';
type DesktopThemePreference = StartupTheme | 'system';
type GitHubRelease = { tag_name?: string; html_url?: string; body?: string };

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
	app.quit();
}

async function createMainWindow(applicationUrl: string): Promise<void> {
	const trustedOrigin = new URL(applicationUrl);

	if (!mainWindow) {
		mainWindow = createShellWindow('#080807');
	}

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);

		return { action: 'deny' };
	});

	mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
		const requestedUrl = new URL(navigationUrl);

		if (requestedUrl.origin !== trustedOrigin.origin) {
			event.preventDefault();
			void shell.openExternal(navigationUrl);
		}
	});

	await mainWindow.loadURL(applicationUrl);
}

function createShellWindow(backgroundColor: string): BrowserWindow {
	const window = new BrowserWindow({
		width: 1400,
		height: 900,
		show: true,
		title: '',
		titleBarStyle: 'hidden',
		trafficLightPosition: { x: 16, y: 12 },
		backgroundColor,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: true,
			spellcheck: false,
		},
	});

	window.on('closed', () => {
		mainWindow = null;
	});

	return window;
}

function resolveDesktopThemePreference(databasePath: string): DesktopThemePreference {
	try {
		const theme = execFileSync('/usr/bin/sqlite3', [databasePath, "select theme from dashboard_settings where id = 'default' limit 1"], { encoding: 'utf8' }).trim();
		if (theme === 'light' || theme === 'dark' || theme === 'system') return theme;
	} catch {}

	return 'system';
}

function resolveStartupTheme(theme: DesktopThemePreference): StartupTheme {
	if (theme === 'light' || theme === 'dark') return theme;

	return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function applyNativeThemePreference(theme: DesktopThemePreference): void {
	nativeTheme.themeSource = theme;
}

function normalizeReleaseTag(tag: string | null | undefined): string | null {
	const normalized = tag?.trim();
	if (!normalized) return null;
	return normalized.startsWith('v') ? normalized.slice(1) : normalized;
}

async function fetchLatestRelease(): Promise<GitHubRelease> {
	const response = await fetch(githubLatestReleaseUrl, { headers: { Accept: 'application/vnd.github+json' } });
	if (!response.ok) throw new Error(`GitHub release lookup failed with HTTP ${response.status}`);
	return await response.json() as GitHubRelease;
}

async function checkForUpdates(): Promise<DesktopUpdateCheckResult> {
	const currentVersion = normalizeReleaseTag(app.getVersion());
	const currentTag = currentVersion ? `v${currentVersion}` : null;
	const latestRelease = await fetchLatestRelease();
	const latestTag = latestRelease.tag_name ?? null;
	const latestVersion = normalizeReleaseTag(latestTag);
	const updateAvailable = Boolean(currentVersion && latestVersion && currentVersion !== latestVersion);

	return {
		currentVersion,
		latestVersion,
		currentTag,
		latestTag,
		updateAvailable,
		releaseUrl: latestRelease.html_url ?? null,
		releaseNotes: latestRelease.body ?? null,
		message: !currentVersion
			? 'This build does not include application version metadata.'
			: updateAvailable ? `Yoda ${latestTag ?? latestVersion} is available.` : 'Yoda is up to date.',
	};
}

async function installUpdate(): Promise<void> {
	if (process.platform !== 'darwin') throw new Error('Yoda updates are only supported on macOS.');
	if (!app.isPackaged) throw new Error('Updates can only be installed from the packaged desktop app. Run the installed Yoda app from /Applications to update it.');
	const installerPath = path.join(app.getAppPath(), 'install.sh');
	if (!fs.existsSync(installerPath)) throw new Error('The bundled installer could not be found.');
	const installer = spawn('/bin/bash', [installerPath, '--launch'], {
		env: { ...process.env, YODA_INSTALL_YES: '1' },
		detached: true,
		stdio: 'ignore',
	});
	installer.unref();
	isQuitting = true;
	app.quit();
}

function registerDesktopIpc(): void {
	ipcMain.handle('desktop:theme:set-source', (_event, theme: unknown) => {
		if (theme !== 'light' && theme !== 'dark' && theme !== 'system') return;
		applyNativeThemePreference(theme);
	});

	ipcMain.handle('desktop:app:restart', () => {
		isQuitting = true;
		app.relaunch();
		app.quit();
	});

	ipcMain.handle('desktop:updates:check', () => checkForUpdates());

	ipcMain.handle('desktop:updates:install', () => installUpdate());
}

async function showStartupWindow(theme: StartupTheme): Promise<void> {
	const colors = theme === 'dark'
		? { background: '#080807', foreground: '#f7f2e8', muted: '#a7a29a', track: '#38342d', accent: '#f3c623' }
		: { background: '#faf9f5', foreground: '#191714', muted: '#6f6a61', track: '#e7e2d8', accent: '#c29513' };

	mainWindow = createShellWindow(colors.background);
	await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Yoda</title>
		<style>
			html, body { margin: 0; width: 100%; height: 100%; background: ${colors.background}; color: ${colors.foreground}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
			body { display: grid; place-items: center; }
			main { display: grid; gap: 14px; place-items: center; }
			h1 { margin: 0; font-size: 34px; letter-spacing: -0.04em; }
			p { margin: 0; color: ${colors.muted}; font-size: 14px; }
			div { width: 28px; height: 28px; border: 2px solid ${colors.track}; border-top-color: ${colors.accent}; border-radius: 999px; animation: spin 900ms linear infinite; }
			@keyframes spin { to { transform: rotate(360deg); } }
		</style>
	</head>
	<body>
		<main>
			<div></div>
			<h1>Yoda</h1>
			<p>Preparing your workspace…</p>
		</main>
	</body>
</html>`)}`);
}

async function stopApplication(): Promise<void> {
	if (runningServer) {
		await runningServer.stop();
		runningServer = null;
	}
}

function resolveDatabasePath(): string {
	const databaseName = 'yoda-native.db';
	if (!app.isPackaged) return path.resolve(databaseName);

	const source = path.join(app.getAppPath(), 'build', databaseName);
	const target = path.join(app.getPath('userData'), databaseName);

	if (!fs.existsSync(target)) {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(source, target);
	}

	return target;
}

async function bootstrap(): Promise<void> {
	await app.whenReady();

	process.env.APPLICATION_ROOT = app.getAppPath();
	process.env.APPLICATION_DATA_ROOT = app.getPath('userData');
	process.env.DB_PATH = resolveDatabasePath();
	registerDesktopIpc();
	const desktopThemePreference = resolveDesktopThemePreference(process.env.DB_PATH);
	applyNativeThemePreference(desktopThemePreference);
	const startupTheme = resolveStartupTheme(desktopThemePreference);
	process.env.PATH = Array.from(new Set([
		'/opt/homebrew/bin',
		'/usr/local/bin',
		'/usr/bin',
		'/bin',
		'/usr/sbin',
		'/sbin',
		...(process.env.PATH ?? '').split(':').filter(Boolean),
	])).join(':');
	process.chdir(app.getAppPath());
	await showStartupWindow(startupTheme);

	await applyPendingDatabaseBackupRestore();
	const orm = await MikroORM.init({
		...ormConfig,
		dbName: process.env.DB_PATH,
	});
	try {
		await orm.migrator.up();
		await createDashboardRepository(orm.em.fork()).seedFromJsonIfEmpty();
	} finally {
		await orm.close(true);
	}

	runningServer = await startHttpServer();
	const applicationUrl = new URL(runningServer.url);

	await createMainWindow(applicationUrl.toString());

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createMainWindow(applicationUrl.toString());
		}
	});
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('second-instance', () => {
	if (!mainWindow) {
		return;
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}

	mainWindow.show();
	mainWindow.focus();
});

app.on('before-quit', (event) => {
	if (isQuitting) {
		return;
	}

	event.preventDefault();
	isQuitting = true;

	void stopApplication().finally(() => {
		app.quit();
	});
});

bootstrap().catch((error: unknown) => {
	console.error(error);
	app.quit();
});
