export type AudioCaptureStatus = 'idle' | 'capturing';
export type DesktopThemeSource = 'light' | 'dark' | 'system';

export type DesktopUpdateCheckResult = {
	currentVersion: string | null;
	latestVersion: string | null;
	currentTag: string | null;
	latestTag: string | null;
	updateAvailable: boolean;
	releaseUrl: string | null;
	releaseNotes: string | null;
	message: string;
};

export type DesktopApi = {
	system: {
		getPlatform(): Promise<NodeJS.Platform>;
	};
	app: {
		restart(): Promise<void>;
	};
	updates: {
		check(): Promise<DesktopUpdateCheckResult>;
		install(): Promise<void>;
	};
	theme: {
		setSource(theme: DesktopThemeSource): Promise<void>;
	};
	audio: {
		getStatus(): Promise<AudioCaptureStatus>;
		start(): Promise<void>;
		stop(): Promise<void>;
	};
};
