import { autoUpdater } from 'electron-updater';
import { app, ipcMain } from 'electron';

export type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'ready';

export interface UpdateInfo {
	status: UpdateStatus;
	version?: string;
	error?: string;
}

let currentStatus: UpdateStatus = 'not-available';
let newVersion: string | undefined;

export function setupAutoUpdater(): void {
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;

	autoUpdater.on('checking-for-update', () => {
		currentStatus = 'checking';
	});

	autoUpdater.on('update-available', (info) => {
		currentStatus = 'available';
		newVersion = info.version;
	});

	autoUpdater.on('update-not-available', () => {
		currentStatus = 'not-available';
	});

	autoUpdater.on('error', (err) => {
		currentStatus = 'error';
		console.error('Update error:', err);
	});

	autoUpdater.on('download-progress', () => {
		currentStatus = 'downloading';
	});

	autoUpdater.on('update-downloaded', () => {
		currentStatus = 'ready';
	});

	ipcMain.handle('desktop:update:check', async () => {
		try {
			const result = await autoUpdater.checkForUpdates();
			return { status: currentStatus, version: newVersion } as UpdateInfo;
		} catch (error) {
			return { status: 'error', error: (error as Error).message } as UpdateInfo;
		}
	});

	ipcMain.handle('desktop:update:download', async () => {
		try {
			currentStatus = 'downloading';
			await autoUpdater.downloadUpdate();
			return { status: currentStatus, version: newVersion } as UpdateInfo;
		} catch (error) {
			return { status: 'error', error: (error as Error).message } as UpdateInfo;
		}
	});

	ipcMain.handle('desktop:update:install', () => {
		isQuitting = true;
		autoUpdater.quitAndInstall();
	});

	ipcMain.handle('desktop:update:status', () => {
		return { status: currentStatus, version: newVersion } as UpdateInfo;
	});
}

let isQuitting = false;
export function getIsQuitting(): boolean {
	return isQuitting;
}

export function setIsQuitting(value: boolean): void {
	isQuitting = value;
}
