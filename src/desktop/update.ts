import { execFile, spawn } from 'node:child_process';
import { app, ipcMain } from 'electron';

export type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'ready';

export interface UpdateInfo {
	status: UpdateStatus;
	version?: string;
	error?: string;
}

const CURRENT_VERSION = app.getVersion();
const REPO = 'alphaofficial/yoda-native';

async function getLatestVersion(): Promise<{ version: string; htmlUrl: string } | null> {
	return new Promise((resolve) => {
		execFile('curl', ['-fsSL', `https://api.github.com/repos/${REPO}/releases/latest`], (error, stdout) => {
			if (error) {
				resolve(null);
				return;
			}
			try {
				const release = JSON.parse(stdout);
				const version = release.tag_name?.replace(/^v/, '') ?? '';
				resolve({ version, htmlUrl: release.html_url ?? '' });
			} catch {
				resolve(null);
			}
		});
	});
}

async function compareVersions(current: string, latest: string): Promise<boolean> {
	const parse = (v: string) => v.split('.').map(Number);
	const currentParts = parse(current);
	const latestParts = parse(latest);

	for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
		const a = currentParts[i] ?? 0;
		const b = latestParts[i] ?? 0;
		if (b > a) return true;
		if (a > b) return false;
	}
	return false;
}

export function setupAutoUpdater(): void {
	ipcMain.handle('desktop:update:check', async () => {
		try {
			const latest = await getLatestVersion();
			if (!latest) {
				return { status: 'error', error: 'Could not fetch release info' } as UpdateInfo;
			}

			const hasUpdate = await compareVersions(CURRENT_VERSION, latest.version);
			if (hasUpdate) {
				return { status: 'available', version: latest.version } as UpdateInfo;
			}
			return { status: 'not-available' } as UpdateInfo;
		} catch (error) {
			return { status: 'error', error: (error as Error).message } as UpdateInfo;
		}
	});

	ipcMain.handle('desktop:update:download', async () => {
		return { status: 'error', error: 'Updates are handled by the installer' } as UpdateInfo;
	});

	ipcMain.handle('desktop:update:install', async () => {
		const isMac = process.platform === 'darwin';

		if (!isMac) {
			return { status: 'error', error: 'Update installer only supports macOS' } as UpdateInfo;
		}

		const installScript = app.isPackaged
			? `${app.getPath('exe').replace(/\/[^/]+$/, '')}/../install.sh`
			: `${app.getAppPath()}/install.sh`;

		return new Promise<UpdateInfo>((resolve) => {
			isQuitting = true;

			const child = spawn(installScript, ['--launch'], {
				detached: true,
				stdio: 'ignore',
				env: { ...process.env, YODA_INSTALL_YES: '1' },
			});

			child.unref();

			setTimeout(() => {
				app.quit();
				resolve({ status: 'ready' } as UpdateInfo);
			}, 500);
		});
	});

	ipcMain.handle('desktop:update:status', () => {
		return { status: 'not-available' } as UpdateInfo;
	});
}

let isQuitting = false;
export function getIsQuitting(): boolean {
	return isQuitting;
}

export function setIsQuitting(value: boolean): void {
	isQuitting = value;
}
