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
		saveBackupSecret: (userId: string, secret: string) => Promise<boolean>;
		loadBackupSecret: (userId: string) => Promise<string | null>;
		clearBackupSecret: (userId: string) => Promise<boolean>;
		copyToClipboard: (text: string, autoClearSec?: number) => Promise<boolean>;
	};
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_CGP_WEB_URL?: string;
  readonly VITE_CGP_AUTH_REDIRECT_URL?: string;
}
