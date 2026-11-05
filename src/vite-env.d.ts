/// <reference types="vite/client" />

interface Window {
	desktopApp?: {
		refreshApp: () => Promise<{ installerLaunched: boolean }>;
		saveCourseDocument: (fileName: string, data: ArrayBuffer) => Promise<string>;
		openCourseDocument: (filePath: string) => Promise<string>;
		deleteCourseDocument: (filePath: string) => Promise<void>;
	};
	multiVaultAPI?: {
		saveVault: (data: unknown) => Promise<boolean>;
		loadVault: () => Promise<unknown>;
		copyToClipboard: (text: string, autoClearSec?: number) => Promise<boolean>;
	};
}
