import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  BookHeart,
  Check,
  FileJson,
  FolderUp,
  Layers3,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import type { LibraryBundleImportSummary, LibraryBundlePreview } from '../types';
import { importLibraryBundle } from '../db/repositories';
import { errorMessage } from '../lib/errors';
import { parseLibraryBundle } from '../lib/transfer';
import { Modal } from './Modal';
import { useToast } from './ToastProvider';

interface ImportLibrariesDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (summary: LibraryBundleImportSummary) => void;
}

export function ImportLibrariesDialog({
  open,
  onClose,
  onImported,
}: ImportLibrariesDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [preview, setPreview] = useState<LibraryBundlePreview | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError('');
    setReading(false);
    setImporting(false);
    setIsDragging(false);
  }, [open]);

  const handleFile = async (file: File) => {
    setError('');
    setReading(true);
    setPreview(null);
    try {
      if (!file.name.toLocaleLowerCase('en-US').endsWith('.json')) {
        throw new Error('请选择由「导出全部」生成的 .json 词库合集文件');
      }
      if (file.size > 12 * 1024 * 1024) {
        throw new Error('文件有点大，请控制在 12MB 以内');
      }
      const text = await file.text();
      if (!text.trim()) throw new Error('这个文件是空的');
      const parsed = parseLibraryBundle(text, file.name);
      setPreview(parsed);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setReading(false);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleImport = async () => {
    if (!preview || preview.libraries.length === 0 || importing) return;
    setImporting(true);
    setError('');
    try {
      const summary = await importLibraryBundle(preview.libraries);
      toast(
        summary.renamedCount > 0
          ? `已导入 ${summary.libraries.length} 个词库、${summary.totalWords} 个单词；重名词库已自动改名`
          : `已导入 ${summary.libraries.length} 个词库、${summary.totalWords} 个单词`,
      );
      onImported(summary);
    } catch (caught) {
      setError(errorMessage(caught));
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={importing ? () => undefined : onClose}
      title="导入 JSON 词库合集"
      eyebrow="LIBRARY PACK"
      description="JSON 只负责批量导入词库，可一次导入一个或多个词库；CSV 请进词库后添加单词。同名词库不会覆盖现有内容。"
      size="lg"
      hideClose={importing}
      closeOnBackdrop={!importing}
      footer={
        <>
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
            disabled={importing}
          >
            取消
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleImport}
            disabled={!preview || preview.libraries.length === 0 || importing || reading}
          >
            {importing ? (
              '正在整理词库…'
            ) : preview ? (
              <>
                <Check size={16} /> 导入 {preview.libraries.length} 个词库
              </>
            ) : (
              '先选择词库合集'
            )}
          </button>
        </>
      }
    >
      <div className="import-dialog">
        {!preview && (
          <>
            <div
              className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              aria-label="选择词库合集文件"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                onChange={onInputChange}
                hidden
              />
              <span className="dropzone__icon">
                {reading ? <RefreshCw className="spin" size={26} /> : <FolderUp size={26} />}
              </span>
              <strong>{reading ? '正在读取词库合集…' : '点击选择 JSON，或拖到这里'}</strong>
              <span>只接收 .json 词库文件 · 可一次导入多个词库 · 最大 12MB</span>
              <div className="dropzone__formats">
                <span>
                  <FileJson size={14} /> 词库合集 JSON
                </span>
              </div>
            </div>

            <div className="soft-note">
              <Sparkles size={16} />
              <span>
                在「我的词库」点「导出全部」，会得到一个包含所有词库的 JSON。把它发给朋友，对方选择这个文件就能一次导入全部词库。
              </span>
            </div>
          </>
        )}

        {preview && (
          <div className="import-preview">
            <div className="import-preview__head">
              <div className="file-pill">
                <FileJson size={16} />
                <span>{preview.fileName}</span>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setPreview(null);
                  setError('');
                }}
                disabled={importing}
              >
                <UploadCloud size={14} /> 换一个文件
              </button>
            </div>

            <div className="import-stats">
              <div className="import-stat import-stat--good">
                <strong>{preview.libraries.length}</strong>
                <span>个词库</span>
              </div>
              <div className="import-stat">
                <strong>{preview.totalWords}</strong>
                <span>个单词</span>
              </div>
              <div className={preview.skippedWords > 0 ? 'import-stat import-stat--warn' : 'import-stat'}>
                <strong>{preview.skippedWords}</strong>
                <span>跳过的单词</span>
              </div>
              <div className="import-stat">
                <strong className="import-stat__format">JSON</strong>
                <span>合集格式</span>
              </div>
            </div>

            {preview.libraries.length > 0 && (
              <div className="bundle-library-list">
                {preview.libraries.map((library, index) => (
                  <div className="bundle-library-row" key={`${library.name}-${index}`}>
                    <span className="bundle-library-row__icon">
                      <BookHeart size={17} />
                    </span>
                    <div className="bundle-library-row__main">
                      <strong>{library.name}</strong>
                      <span>{library.description || '没有写描述'}</span>
                    </div>
                    <span className="bundle-library-row__count">
                      <Layers3 size={13} /> {library.words.length} 个词
                    </span>
                  </div>
                ))}
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="issue-list">
                <div className="issue-list__title">
                  <TriangleAlert size={15} /> 导入提示
                </div>
                {preview.issues.slice(0, 5).map((issue, index) => (
                  <p key={`${issue}-${index}`}>{issue}</p>
                ))}
              </div>
            )}

            <div className="soft-note">
              <Sparkles size={16} />
              <span>
                如果已有同名词库，新词库会自动命名为「词库名（导入）」，不会覆盖原有词库。
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
