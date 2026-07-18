const AUDIO_MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
]

export function selectAudioMime(isSupported: (mime: string) => boolean): string | undefined {
  return AUDIO_MIME_CANDIDATES.find(isSupported)
}

export function getAudioDownloadFilename(title: string, mimeType: string): string {
  const safeTitle = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') || '未命名录音'
  const extension = mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm'
  return `${safeTitle}.${extension}`
}
