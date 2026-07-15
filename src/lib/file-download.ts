import { Capacitor, registerPlugin } from '@capacitor/core'

interface FileDownloadPlugin {
  save(options: { data: string; filename: string; mimeType: string }): Promise<void>
}

const FileDownload = registerPlugin<FileDownloadPlugin>('FileDownload')

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('文件编码失败'))
        return
      }
      resolve(reader.result.slice(reader.result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

export async function downloadBlob(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) {
    // ponytail: base64 会完整经过桥接内存；超长录音需要改为原生流式写入。
    await FileDownload.save({
      data: await blobToBase64(blob),
      filename,
      mimeType: blob.type.split(';')[0] || 'application/octet-stream',
    })
    return 'native' as const
  }

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
