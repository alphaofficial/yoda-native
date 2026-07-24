export type AudioCaptureStatus = 'idle' | 'capturing';
export type DesktopThemeSource = 'light' | 'dark' | 'system';
export type UpdateStatus = 'checking' | 'available' | 'not-available' | 'error' | 'downloading' | 'ready';

export interface UpdateInfo {
	status: UpdateStatus;
	version?: string;
	error?: string;
}

export type DesktopApi = {
	system: {
		getPlatform(): Promise<NodeJS.Platform>;
	};
	app: {
		restart(): Promise<void>;
	};
	update: {
		check(): Promise<UpdateInfo>;
		download(): Promise<UpdateInfo>;
		install(): Promise<void>;
		getStatus(): Promise<UpdateInfo>;
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
