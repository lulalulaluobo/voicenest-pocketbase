import { SAMPLE_NOTE_TYPES, type NoteType } from '../domain/recording'

interface TypePickerProps {
  selectedId: string
  onChange(type: NoteType): void
}

export function TypePicker({ selectedId, onChange }: TypePickerProps) {
  return (
    <div className="type-picker" aria-label="选择笔记类型">
      {SAMPLE_NOTE_TYPES.map((type) => (
        <button
          className={type.id === selectedId ? 'selected' : ''}
          key={type.id}
          onClick={() => onChange(type)}
          type="button"
        >
          {type.name}
        </button>
      ))}
    </div>
  )
}
