import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopApi } from './types';

const desktopApi: DesktopApi = {
	system: {
		getPlatform() {
			return ipcRenderer.invoke('desktop:system:get-platform');
		},
	},
	theme: {
		setSource(theme) {
			return ipcRenderer.invoke('desktop:theme:set-source', theme);
		},
	},
	audio: {
		getStatus() {
			return ipcRenderer.invoke('desktop:audio:get-status');
		},

		start() {
			return ipcRenderer.invoke('desktop:audio:start');
		},

		stop() {
			return ipcRenderer.invoke('desktop:audio:stop');
		},
	},
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
