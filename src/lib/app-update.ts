import { registerPlugin } from '@capacitor/core'

interface AppUpdatePlugin {
  check(): Promise<{ available: boolean, versionName?: string }>
  downloadAndInstall(): Promise<void>
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

export function checkForAppUpdate() {
  return AppUpdate.check()
}

export function downloadAndInstallAppUpdate() {
  return AppUpdate.downloadAndInstall()
}
