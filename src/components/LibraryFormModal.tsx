import { useEffect, useState, type FormEvent } from 'react';
import type { Library } from '../types';
import { createLibrary, updateLibrary } from '../db/repositories';
import { errorMessage } from '../lib/errors';
import { MAX_LIBRARY_TAGS, MAX_LIBRARY_TAG_LENGTH } from '../lib/libraryTags';
import { Modal } from './Modal';
import { TagInput } from './TagInput';
import { BookHeart, Sparkles } from 'lucide-react';

interface LibraryFormModalProps {
  open: boolean;
  library?: Library | null;
  onClose: () => void;
  onSaved: (library: Library) => void;
}

export function LibraryFormModal({ open, library, onClose, onSaved }: LibraryFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(library);

  useEffect(() => {
    if (!open) return;
    setName(library?.name ?? '');
    setDescription(library?.description ?? '');
    setTags(library?.tags ?? []);
    setError('');
    setSaving(false);
  }, [open, library]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const result = library
        ? await updateLibrary(library.id, { name, description, tags })
        : await createLibrary({ name, description, tags });
      onSaved(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={editing ? '编辑词库' : '新建一个小词库'}
      eyebrow={editing ? 'LIBRARY' : 'NEW LIBRARY'}
      description={
        editing
          ? '名字、描述和标签随时都可以改，学习数据不会受到影响。'
          : '按主题、来源或心情来分类都可以，也可以给词库加上标签。'
      }
      size="sm"
      hideClose={saving}
      closeOnBackdrop={!saving}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" form="library-form" className="button button--primary" disabled={saving}>
            {saving ? '保存中…' : editing ? '保存修改' : '创建词库'}
          </button>
        </>
      }
    >
      <form className="form-stack" id="library-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="library-name">
            词库名称 <span className="required">*</span>
          </label>
          <div className="input-with-icon">
            <BookHeart size={17} />
            <input
              id="library-name"
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="比如：雅思核心词、我最喜欢的电影台词"
              maxLength={40}
              autoFocus
              required
            />
          </div>
          <span className="form-hint">最多 40 个字符 · {name.length}/40</span>
        </div>

        <div className="form-field">
          <label htmlFor="library-description">词库描述</label>
          <textarea
            id="library-description"
            className="text-input text-area"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="写一句只有你懂的小备注（可不填）"
            rows={3}
            maxLength={300}
          />
          <span className="form-hint">选填 · {description.length}/300</span>
        </div>

        <div className="form-field">
          <label>词库标签</label>
          <TagInput
            value={tags}
            onChange={setTags}
            placeholder="比如：考研、雅思、阅读、待复习"
            ariaLabel="词库标签"
            disabled={saving}
          />
          <span className="form-hint">
            选填 · 最多 {MAX_LIBRARY_TAGS} 个，每个不超过 {MAX_LIBRARY_TAG_LENGTH} 个字符；回车或逗号分隔
          </span>
        </div>

        {!editing && (
          <div className="soft-note">
            <Sparkles size={16} />
            <span>创建后可以手动添加单词，也可以整批导入 CSV / JSON。</span>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
