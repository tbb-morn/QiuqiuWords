import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}

export function TagInput({
  value,
  onChange,
  placeholder = '输入后按回车',
  ariaLabel,
  disabled = false,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw?: string) => {
    const source = raw ?? draft;
    const items = source
      .split(/[,，|｜]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setDraft('');
      return;
    }
    const existing = new Set(value.map((item) => item.toLocaleLowerCase('en-US')));
    const next = [...value];
    for (const item of items) {
      const key = item.toLocaleLowerCase('en-US');
      if (!existing.has(key)) {
        next.push(item);
        existing.add(key);
      }
    }
    onChange(next);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span className="tag-input__tag" key={tag}>
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`移除 ${tag}`}
            disabled={disabled}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={value.length === 0 ? placeholder : ''}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit()}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}
