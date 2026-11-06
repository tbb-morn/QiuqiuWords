import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import type {
  DuplicateStrategy,
  ImportPreview,
  ImportSummary,
  Library,
} from '../types';
import { db } from '../db/db';
import { importWords } from '../db/repositories';
import { errorMessage } from '../lib/errors';
import { downloadTextFile, normalizeWordKey } from '../lib/utils';
import { CSV_TEMPLATE, parseCsvImport } from '../lib/transfer';
import { Modal } from './Modal';
import { useToast } from './ToastProvider';

interface ImportWordsDialogProps {
  open: boolean;
  library: Library;
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
}

async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Excel 在 Windows 上可能导出带 BOM 的 UTF-16 文本。
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer).replace(/^\uFEFF/, '');
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer).replace(/^\uFEFF/, '');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buffer).replace(/^\uFEFF/, '');
    } catch {
      return new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    }
  }
}

export function ImportWordsDialog({
  open,
  library,
  onClose,
  onImported,
}: ImportWordsDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [existingMatches, setExistingMatches] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setError('');
    setReading(false);
    setImporting(false);
    setStrategy('skip');
    setExistingMatches(0);
    setIsDragging(false);
    setShowHelp(false);
  }, [open, library.id]);

  const accept = '.csv,text/csv';

  const handleFile = async (file: File) => {
    setError('');
    setReading(true);
    setPreview(null);
    try {
      const lower = file.name.toLocaleLowerCase('en-US');
      if (!lower.endsWith('.csv')) {
        throw new Error('这里只接收 CSV 单词文件；JSON 请到「我的词库 → 导入词库」');
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('文件有点大，请控制在 8MB 以内');
      }
      const text = await readFileText(file);
      if (!text.trim()) throw new Error('这个文件是空的');
      const parsed = parseCsvImport(text, file.name);
      const existingWords = await db.words.where('libraryId').equals(library.id).toArray();
      const existingKeys = new Set(existingWords.map((word) => word.wordKey));
      const matches = parsed.words.filter((word) =>
        existingKeys.has(normalizeWordKey(word.word)),
      ).length;
      setExistingMatches(matches);
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
    if (!preview || preview.words.length === 0 || importing) return;
    setImporting(true);
    setError('');
    try {
      const summary = await importWords(library.id, preview.words, strategy);
      toast(
        `导入完成：新增 ${summary.added} 个，更新 ${summary.updated} 个，跳过 ${summary.skipped} 个`,
      );
      onImported(summary);
    } catch (caught) {
      setError(errorMessage(caught));
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    downloadTextFile('丘丘背单词-导入模板.csv', CSV_TEMPLATE, 'text/csv;charset=utf-8');
    toast('模板已经下载好啦，可以直接用 Excel 打开', 'info');
  };

  return (
    <Modal
      open={open}
      onClose={importing ? () => undefined : onClose}
      title="用 CSV 批量添加单词"
      eyebrow="BATCH IMPORT"
      description={`导入到「${library.name}」· CSV 只负责往这个词库添加单词；JSON 请到「我的词库」导入词库。`}
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
            disabled={!preview || preview.words.length === 0 || importing || reading}
          >
            {importing ? (
              '正在导入…'
            ) : preview ? (
              <>
                <Check size={16} /> 导入 {preview.words.length} 个单词
              </>
            ) : (
              '先选择文件'
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
              aria-label="选择 CSV 单词文件"
            >
              <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={onInputChange}
                hidden
              />
              <span className="dropzone__icon">
                {reading ? <RefreshCw className="spin" size={26} /> : <UploadCloud size={26} />}
              </span>
              <strong>{reading ? '正在读取单词…' : '点击选择 CSV，或拖到这里'}</strong>
              <span>只接收 .csv 文件，最大 8MB</span>
              <div className="dropzone__formats">
                <span>
                  <FileSpreadsheet size={14} /> CSV
                </span>
              </div>
            </div>

            <div className="import-help">
              <button
                type="button"
                className="text-button"
                onClick={() => setShowHelp((value) => !value)}
              >
                <Sparkles size={15} />
                {showHelp ? '收起格式说明' : '第一次导入？看看 CSV 怎么填'}
              </button>
              {showHelp && (
                <div className="import-help__body">
                  <p>
                    第一行是表头，其中 <code>word</code> 必填，其余都可以留空。多个释义用{' '}
                    <code>|</code> 分隔；例句用 <code>::</code> 分隔英文和中文，用{' '}
                    <code>||</code> 分隔多条。
                  </p>
                  <p>
                    也可以导入丘丘背单词导出 CSV 后重新整理的内容。表头支持中文，比如
                    「单词、音标、释义、例句」。没有识别的额外列会自动成为自定义字段。
                    JSON 不用于这里，而是到「我的词库」批量导入词库。
                  </p>
                  <button type="button" className="button button--soft button--sm" onClick={downloadTemplate}>
                    <Download size={15} /> 下载 CSV 模板
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {preview && (
          <div className="import-preview">
            <div className="import-preview__head">
              <div className="file-pill">
                <FileSpreadsheet size={16} />
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
                <FileUp size={14} /> 换一个文件
              </button>
            </div>

            <div className="import-stats">
              <div className="import-stat import-stat--good">
                <strong>{preview.words.length}</strong>
                <span>可导入</span>
              </div>
              <div className="import-stat">
                <strong>{existingMatches}</strong>
                <span>与现有重复</span>
              </div>
              <div className="import-stat">
                <strong>{preview.duplicateInFile}</strong>
                <span>文件内重复</span>
              </div>
              <div className={preview.invalidRows > 0 ? 'import-stat import-stat--warn' : 'import-stat'}>
                <strong>{preview.invalidRows}</strong>
                <span>无效行</span>
              </div>
            </div>

            {preview.words.length > 0 && (
              <>
                <div className="preview-list">
                  {preview.words.slice(0, 4).map((word) => (
                    <div className="preview-word" key={word.word}>
                      <strong>{word.word}</strong>
                      <span>
                        {word.phonetic && <em>{word.phonetic}</em>}
                        {word.definitions.map((item) => item.meaning).join('；') || '暂无释义'}
                      </span>
                    </div>
                  ))}
                  {preview.words.length > 4 && (
                    <p className="preview-more">还有 {preview.words.length - 4} 个单词没有展开…</p>
                  )}
                </div>

                <fieldset className="choice-group">
                  <legend>遇到同名单词时</legend>
                  <label className={`choice-card ${strategy === 'skip' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="duplicate-strategy"
                      value="skip"
                      checked={strategy === 'skip'}
                      onChange={() => setStrategy('skip')}
                    />
                    <span>
                      <strong>保留原来的单词</strong>
                      <small>跳过重复项，不覆盖已经编辑好的内容</small>
                    </span>
                  </label>
                  <label className={`choice-card ${strategy === 'update' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="duplicate-strategy"
                      value="update"
                      checked={strategy === 'update'}
                      onChange={() => setStrategy('update')}
                    />
                    <span>
                      <strong>用文件内容更新</strong>
                      <small>同名单词的内容会被覆盖，学习状态保留</small>
                    </span>
                  </label>
                </fieldset>
              </>
            )}

            {preview.issues.length > 0 && (
              <div className="issue-list">
                <div className="issue-list__title">
                  <TriangleAlert size={15} /> 格式提示
                </div>
                {preview.issues.slice(0, 4).map((issue, index) => (
                  <p key={`${issue.row}-${index}`}>
                    {issue.row > 0 ? `第 ${issue.row} 行：` : ''}
                    {issue.message}
                  </p>
                ))}
              </div>
            )}
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
