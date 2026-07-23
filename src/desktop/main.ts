import 'dotenv-defaults/config';

import path from 'node:path';

import { app, BrowserWindow, shell } from 'electron';

import type { RunningHttpServer } from '@/runtime/startHttpServer';

let mainWindow: BrowserWindow | null = null;
let runningServer: RunningHttpServer | null = null;
let isQuitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
	app.quit();
}

async function createMainWindow(applicationUrl: string): Promise<void> {
	const trustedOrigin = new URL(applicationUrl);

	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: true,
			spellcheck: false,
		},
	});

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

	mainWindow.once('ready-to-show', () => {
		mainWindow?.show();
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	await mainWindow.loadURL(applicationUrl);
}

async function stopApplication(): Promise<void> {
	if (runningServer) {
		await runningServer.stop();
		runningServer = null;
	}
}

async function bootstrap(): Promise<void> {
	await app.whenReady();

	process.env.APPLICATION_ROOT = app.getAppPath();
	process.env.APPLICATION_DATA_ROOT = app.getPath('userData');
	process.env.DB_PATH = path.join(app.getAppPath(), 'build', 'yoda-native.db');
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

	const { startHttpServer } = await import('@/runtime/startHttpServer');

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
