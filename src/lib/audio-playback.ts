export function buildPlaybackBlob(chunks: Array<{ blob: Blob }>, mimeType: string): Blob {
  return new Blob(chunks.map((chunk) => chunk.blob), { type: mimeType })
}
