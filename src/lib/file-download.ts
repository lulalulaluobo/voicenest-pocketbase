import { Capacitor, registerPlugin } from '@capacitor/core'

interface FileDownloadPlugin {
  begin(options: { filename: string; mimeType: string }): Promise<void>
  append(options: { data: string }): Promise<void>
  finish(): Promise<void>
  abort(): Promise<void>
}

const FileDownload = registerPlugin<FileDownloadPlugin>('FileDownload')
const NATIVE_CHUNK_BYTES = 256 * 1024

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function downloadBrowserBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'browser' as const
}

export async function downloadStream(
  filename: string,
  mimeType: string,
  produce: (write: (chunk: Uint8Array) => Promise<void>) => Promise<void>,
) {
  if (!Capacitor.isNativePlatform()) {
    const chunks: BlobPart[] = []
    await produce(async (chunk) => { chunks.push(new Uint8Array(chunk)) })
    return downloadBrowserBlob(new Blob(chunks, { type: mimeType }), filename)
  }

  await FileDownload.begin({ filename, mimeType })
  try {
    await produce(async (chunk) => {
      for (let offset = 0; offset < chunk.length; offset += NATIVE_CHUNK_BYTES) {
        await FileDownload.append({ data: bytesToBase64(chunk.subarray(offset, offset + NATIVE_CHUNK_BYTES)) })
      }
    })
    await FileDownload.finish()
    return 'native' as const
  } catch (error) {
    await FileDownload.abort().catch(() => undefined)
    throw error
  }
}

export async function downloadBlob(blob: Blob, filename: string) {
  const mimeType = blob.type.split(';')[0] || 'application/octet-stream'
  if (!Capacitor.isNativePlatform()) return downloadBrowserBlob(blob, filename)

  return downloadStream(filename, mimeType, async (write) => {
    for (let offset = 0; offset < blob.size; offset += NATIVE_CHUNK_BYTES) {
      await write(new Uint8Array(await blob.slice(offset, offset + NATIVE_CHUNK_BYTES).arrayBuffer()))
    }
  })
}
