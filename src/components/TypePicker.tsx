import type { UserNoteType } from '../lib/config-store'

interface TypePickerProps {
  selectedId: string
  types: UserNoteType[]
  onChange(type: UserNoteType): void
}

export function TypePicker({ selectedId, types, onChange }: TypePickerProps) {
  return (
    <div className="type-picker" aria-label="选择笔记类型">
      {types.map((type) => (
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
