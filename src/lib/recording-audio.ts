import { Decoder, Reader, tools } from 'ts-ebml'
import type { Recording } from '../domain/recording'

export async function getRecordingAudioBlob(recording: Recording, parts: Blob[]): Promise<Blob> {
  const raw = new Blob(parts, { type: recording.mimeType })
  if (!recording.mimeType.startsWith('audio/webm')) return raw

  try {
    const buffer = await raw.arrayBuffer()
    const reader = new Reader()
    reader.logging = false
    for (const element of new Decoder().decode(buffer)) reader.read(element)
    reader.stop()

    const metadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues)
    return new Blob([metadata, buffer.slice(reader.metadataSize)], { type: recording.mimeType })
  } catch {
    return raw
  }
}
