import type { ImageMimeType } from '../domain/recording'
import { recordingDb } from './recording-db'

export interface ImagePromptTemplate {
  id: string
  name: string
  prompt: string
  referenceImage?: Blob
  referenceImageMimeType?: ImageMimeType
}

export function listImagePromptTemplates(): Promise<ImagePromptTemplate[]> {
  return recordingDb.imagePromptTemplates.toArray()
}

export function saveImagePromptTemplate(template: ImagePromptTemplate): Promise<string> {
  return recordingDb.imagePromptTemplates.put(template)
}

export function deleteImagePromptTemplate(id: string): Promise<void> {
  return recordingDb.imagePromptTemplates.delete(id)
}
