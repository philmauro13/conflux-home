import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';

async function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    await invoke('write_updater_log', { entry: line });
  } catch {
    console.log('[updater] could not write log:', message);
  }
}

interface UpdateState {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
  downloading: boolean;
  downloaded: boolean;
  error?: string;
}

/**
 * Checks for updates on mount (and every 30 min).
 * Shows a banner when an update is available.
 * Download is triggered manually by user click.
 */
export function useAutoUpdate() {
  const [state, setState] = useState<UpdateState>({
    available: false,
    downloading: false,
    downloaded: false,
  });

  // Check for updates on mount + every 30 min
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (cancelled || !update) return;

        await logToFile(`Update available: v${update.version}`);
        setState({
          available: true,
          version: update.version,
          date: update.date,
          body: update.body,
          downloading: false,
          downloaded: false,
        });
      } catch (err: any) {
        // Silent fail — don't nag user if update server is unreachable
        console.log('[updater] check failed:', err?.message ?? err);
      }
    }

    checkForUpdate();
    const interval = setInterval(checkForUpdate, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Download + install using custom Rust commands (follows redirects)
  const install = async () => {
    setState((s) => ({ ...s, downloading: true, error: undefined }));
    try {
      const update = await check();
      if (!update) {
        setState((s) => ({ ...s, downloading: false, error: 'Update no longer available' }));
        return;
      }

      // Construct download URL from version + platform
      // Use version-free filenames so the URL always works
      const version = update.version.replace('v', '');
      const isLinux = navigator.platform.toLowerCase().includes('linux');
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const isWindows = navigator.platform.toLowerCase().includes('win');
      
      let filename: string;
      if (isLinux) {
        filename = 'Conflux.Home_amd64.AppImage';  // No sudo needed
      } else if (isMac) {
        filename = 'Conflux.Home_x64.app.tar.gz';
      } else if (isWindows) {
        filename = 'Conflux.Home_x64-setup.exe';
      } else {
        filename = 'Conflux.Home_amd64.AppImage';
      }
      
      const downloadUrl = `https://github.com/TheConflux-Core/conflux-home/releases/download/v${version}/${filename}`;
      
      await logToFile(`Platform: ${navigator.platform}`);
      await logToFile(`Constructed URL: ${downloadUrl}`);
      await logToFile(`rawJson: ${JSON.stringify(update.rawJson)}`);
      
      if (!downloadUrl) {
        setState((s) => ({ ...s, downloading: false, error: 'No download URL found' }));
        return;
      }

      await logToFile(`Downloading version ${update.version} from ${downloadUrl}`);

      // Use custom Rust download (follows GitHub redirects)
      const filePath = await invoke<string>('download_update_file', { url: downloadUrl });
      await logToFile(`Downloaded to: ${filePath}`);

      setState((s) => ({ ...s, downloading: false, downloaded: true }));
      await logToFile('Download complete. Ready to install.');

      // Run the installer (spawns NSIS /S in background)
      await invoke('run_installer', { installerPath: filePath });
      await logToFile('Installer launched. Exiting gracefully...');

      // Give the installer a moment to start, then exit gracefully
      await new Promise(r => setTimeout(r, 500));
      await exit(0);
    } catch (err: any) {
      const errorMessage = err?.message ?? err?.toString() ?? JSON.stringify(err) ?? 'Update failed';
      await logToFile(`ERROR: ${errorMessage}`);
      setState((s) => ({
        ...s,
        downloading: false,
        error: errorMessage,
      }));
    }
  };

  const dismiss = () => {
    setState({ available: false, downloading: false, downloaded: false });
  };

  return { ...state, install, dismiss };
}
