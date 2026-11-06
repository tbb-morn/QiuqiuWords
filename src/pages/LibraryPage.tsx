import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookHeart,
  BookOpen,
  Download,
  FileSpreadsheet,
  Filter,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Library, Word, WordWithProgress } from '../types';
import { db } from '../db/db';
import {
  deleteWord,
  getWordsWithProgress,
  sessionHasLearningActivity,
  setWordMastered,
  startSession,
} from '../db/repositories';
import { errorMessage } from '../lib/errors';
import {
  downloadTextFile,
  formatShortDate,
  getSessionProgress,
  safeFileName,
} from '../lib/utils';
import { wordStatusLabel, wordStatusTone } from '../lib/words';
import { wordsToCsv, wordsToJson } from '../lib/transfer';
import { ActionMenu, EmptyState, PageLoader } from '../components/UI';
import { ImportWordsDialog } from '../components/ImportWordsDialog';
import { LibraryFormModal } from '../components/LibraryFormModal';
import { WordFormModal } from '../components/WordFormModal';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastProvider';

type FilterKey = 'all' | 'unknown' | 'unseen' | 'mastered';

export function LibraryPage() {
  const { libraryId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [detailWordId, setDetailWordId] = useState<string | null>(null);
  const [libraryFormOpen, setLibraryFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WordWithProgress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mastering, setMastering] = useState(false);
  const [starting, setStarting] = useState(false);

  const data = useLiveQuery(async () => {
    if (!libraryId) return null;
    const library = await db.libraries.get(libraryId);
    if (!library) return null;
    const [words, sessions] = await Promise.all([
      getWordsWithProgress(libraryId),
      db.sessions.where('libraryId').equals(libraryId).toArray(),
    ]);
    return {
      library,
      words,
      activeSession: sessions.find((session) => session.status === 'in_progress'),
      studyCount: sessions.filter(sessionHasLearningActivity).length,
    };
  }, [libraryId], undefined);

  const detailWord = useMemo(
    () => data?.words.find((word) => word.id === detailWordId) ?? null,
    [data, detailWordId],
  );

  const counts = useMemo(() => {
    const words = data?.words ?? [];
    return {
      all: words.length,
      unknown: words.filter((word) => word.progress.status === 'unknown' && !word.progress.mastered).length,
      unseen: words.filter((word) => word.progress.status === 'unseen' && !word.progress.mastered).length,
      mastered: words.filter((word) => word.progress.mastered).length,
    };
  }, [data]);

  const filteredWords = useMemo(() => {
    const words = data?.words ?? [];
    const query = search.trim().toLocaleLowerCase('zh-CN');
    return words.filter((word) => {
      if (filter === 'unknown' && (word.progress.status !== 'unknown' || word.progress.mastered)) {
        return false;
      }
      if (filter === 'unseen' && (word.progress.status !== 'unseen' || word.progress.mastered)) {
        return false;
      }
      if (filter === 'mastered' && !word.progress.mastered) return false;
      if (!query) return true;
      const haystack = [
        word.word,
        word.phonetic,
        word.mnemonic,
        word.note,
        ...word.definitions.flatMap((item) => [item.partOfSpeech, item.meaning]),
        ...word.examples.flatMap((item) => [item.en, item.zh]),
        ...word.phrases.flatMap((item) => [item.en, item.zh]),
        ...word.derivatives,
        ...word.synonyms,
        ...word.antonyms,
        ...word.customFields.flatMap((item) => [item.label, item.value]),
      ]
        .join(' ')
        .toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    });
  }, [data, filter, search]);

  const handleWordSaved = (word: Word) => {
    setFormOpen(false);
    setEditingWord(null);
    setDetailWordId(word.id);
    toast(editingWord ? '单词已经更新啦' : '新单词已经放进词库');
  };

  const handleEdit = (word: WordWithProgress) => {
    setDetailWordId(null);
    setEditingWord(word);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteWord(deleteTarget.id);
      toast(`「${deleteTarget.word}」已删除`);
      setDeleteTarget(null);
      setDetailWordId(null);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleMastered = async (word: WordWithProgress) => {
    if (mastering) return;
    setMastering(true);
    try {
      await setWordMastered(word.id, !word.progress.mastered);
      toast(
        word.progress.mastered
          ? `已取消「${word.word}」的熟练掌握状态`
          : `「${word.word}」已标记为熟练掌握，以后的学习不再出现`,
      );
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setMastering(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    if (!data) return;
    if (data.words.length === 0) {
      toast('这个词库还没有单词可以导出', 'info');
      return;
    }
    const sorted = [...data.words].sort((a, b) => a.word.localeCompare(b.word, 'en'));
    const base = `${safeFileName(data.library.name)}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') {
      downloadTextFile(`${base}.csv`, wordsToCsv(sorted), 'text/csv;charset=utf-8');
    } else {
      downloadTextFile(
        `${base}.json`,
        wordsToJson(data.library, sorted),
        'application/json;charset=utf-8',
      );
    }
    toast(`已导出 ${sorted.length} 个单词（${format.toUpperCase()}）`);
  };

  const handleStart = async () => {
    if (!data || starting) return;
    setStarting(true);
    try {
      const result = await startSession(data.library.id);
      navigate(`/study/${result.session.id}`);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setStarting(false);
    }
  };

  if (data === undefined) {
    return (
      <div className="page-inner">
        <PageLoader label="正在打开词库…" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="page-inner">
        <div className="panel">
          <EmptyState
            title="这个词库找不到了"
            description="它可能已经被删除，也许可以重新建一个。"
            action={
              <Link to="/libraries" className="button button--primary">
                回到我的词库
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const { library, activeSession, studyCount } = data;
  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'unknown', label: '还不熟', count: counts.unknown },
    { key: 'unseen', label: '未学习', count: counts.unseen },
    { key: 'mastered', label: '已熟练', count: counts.mastered },
  ];

  return (
    <div className="page-inner library-page">
      <Link to="/libraries" className="back-link">
        <ArrowLeft size={16} /> 返回词库列表
      </Link>

      <header className="library-heading">
        <div className="library-heading__main">
          <span className="library-heading__icon">
            <BookHeart size={26} />
          </span>
          <div>
            <div className="library-heading__title">
              <h1>{library.name}</h1>
              <button
                type="button"
                className="icon-button icon-button--soft"
                onClick={() => setLibraryFormOpen(true)}
                aria-label="编辑词库信息"
              >
                <Pencil size={15} />
              </button>
            </div>
            <p>{library.description || '还没有写下描述。'}</p>
            {(library.tags ?? []).length > 0 && (
              <div className="library-heading__tags">
                {library.tags.map((tag) => (
                  <span className="library-tag library-tag--static" key={tag}>
                    <Tag size={11} /> {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="library-heading__meta">
              <span>
                <strong>{counts.all}</strong> 个单词
              </span>
              <span>
                <Star size={13} /> 已熟练 {counts.mastered}
              </span>
              <span>
                <BookOpen size={13} /> 学习 {studyCount} 次
              </span>
              <span>更新于 {formatShortDate(library.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="library-heading__actions">
          <button
            type="button"
            className="button button--soft"
            onClick={() => void handleStart()}
            disabled={starting}
          >
            <Play size={16} fill="currentColor" strokeWidth={0} />
            {activeSession ? '继续学习' : '开始学习'}
          </button>
          <ActionMenu
            label="导入选项"
            triggerLabel="导入"
            triggerIcon={Upload}
            items={[
              {
                label: '导入 CSV 单词',
                icon: FileSpreadsheet,
                hint: '往这个词库添加 / 更新单词',
                onSelect: () => setImportOpen(true),
              },
            ]}
          />
          <ActionMenu
            label="导出选项"
            triggerLabel="导出"
            triggerIcon={Download}
            items={[
              { label: '导出 CSV', icon: Download, onSelect: () => void handleExport('csv') },
              { label: '导出 JSON', icon: Download, onSelect: () => void handleExport('json') },
            ]}
          />
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setEditingWord(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} /> 添加单词
          </button>
        </div>
      </header>

      {activeSession && (
        <div className="active-session-banner">
          <div className="active-session-banner__left">
            <span className="pulse-dot" />
            <div>
              <strong>这个词库有一个未完成的学习会话</strong>
              <p>
                第 {getSessionProgress(activeSession).round.number} 轮 · 已判断{' '}
                {getSessionProgress(activeSession).answered} / {activeSession.rounds.at(-1)?.queue.length}{' '}
                个。学习队列已经固定，编辑单词内容不会打乱它。
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button button--soft button--sm"
            onClick={() => navigate(`/study/${activeSession.id}`)}
          >
            回到会话 <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="word-toolbar">
        <div className="search-box search-box--wide">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索单词、释义、例句、备注…"
            aria-label="搜索单词"
          />
        </div>
        <div className="filter-tabs" role="group" aria-label="按学习状态筛选">
          <span className="filter-tabs__label">
            <Filter size={14} /> 筛选
          </span>
          {filters.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`filter-tab ${filter === item.key ? 'is-active' : ''}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      {counts.all === 0 ? (
        <div className="panel">
          <EmptyState
            title="这个词库还是空空的"
            description="可以一个词一个词地添加，也可以一次性导入整理好的 CSV / JSON。"
            action={
              <div className="button-row">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    setEditingWord(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus size={16} /> 添加第一个单词
                </button>
                <button type="button" className="button button--soft" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> 导入 CSV 单词
                </button>
              </div>
            }
          />
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="panel">
          <EmptyState
            compact
            mascotSize={98}
            title={search ? '没有找到匹配的单词' : '这个筛选下还没有单词'}
            description={search ? '试试别的关键词，或清空筛选。' : '换一个学习状态看看吧。'}
            action={
              <button
                type="button"
                className="button button--soft"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                重置搜索与筛选
              </button>
            }
          />
        </div>
      ) : (
        <div className="word-table-wrap">
          <div className="word-table">
            <div className="word-table__head" aria-hidden="true">
              <span>单词</span>
              <span>释义</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            {filteredWords.map((word) => (
              <article
                className="word-row"
                key={word.id}
                onClick={() => setDetailWordId(word.id)}
                tabIndex={0}
                role="button"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setDetailWordId(word.id);
                  }
                }}
              >
                <div className="word-row__word">
                  <strong>{word.word}</strong>
                  {word.phonetic && <span>{word.phonetic}</span>}
                </div>
                <div className="word-row__meaning">
                  <span>
                    {word.definitions[0]?.partOfSpeech && (
                      <>
                        <em className="word-row__pos">{word.definitions[0].partOfSpeech}</em>{' '}
                      </>
                    )}
                    {word.definitions[0]?.meaning || '还没有释义'}
                  </span>
                  {word.definitions.length > 1 && <small>+{word.definitions.length - 1} 条释义</small>}
                </div>
                <div className="word-row__status">
                  {word.progress.mastered ? (
                    <span className="status-pill status-pill--butter">
                      <Star size={11} fill="currentColor" /> 已熟练
                    </span>
                  ) : (
                    <span className={`status-pill status-pill--${wordStatusTone(word.progress.status)}`}>
                      {wordStatusLabel(word.progress.status)}
                    </span>
                  )}
                </div>
                <div className="word-row__actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className={`icon-button ${word.progress.mastered ? 'is-mastered' : ''}`}
                    onClick={() => void handleToggleMastered(word)}
                    aria-label={word.progress.mastered ? '取消熟练掌握' : '标记为已熟练掌握'}
                    disabled={mastering}
                  >
                    <Star size={15} fill={word.progress.mastered ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => {
                      setEditingWord(word);
                      setFormOpen(true);
                    }}
                    aria-label={`编辑 ${word.word}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger-ghost"
                    onClick={() => setDeleteTarget(word)}
                    aria-label={`删除 ${word.word}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="word-table__count">
            正在显示 {filteredWords.length} / {counts.all} 个单词
          </p>
        </div>
      )}

      <WordFormModal
        open={formOpen}
        libraryId={library.id}
        word={editingWord}
        onClose={() => {
          setFormOpen(false);
          setEditingWord(null);
        }}
        onSaved={handleWordSaved}
      />

      <WordDetailDrawer
        open={Boolean(detailWord)}
        word={detailWord}
        libraryName={library.name}
        busy={mastering}
        onClose={() => setDetailWordId(null)}
        onEdit={handleEdit}
        onDelete={(word) => {
          setDetailWordId(null);
          setDeleteTarget(word);
        }}
        onToggleMastered={(word) => void handleToggleMastered(word)}
      />

      <ImportWordsDialog
        open={importOpen}
        library={library}
        onClose={() => setImportOpen(false)}
        onImported={() => setImportOpen(false)}
      />

      <LibraryFormModal
        open={libraryFormOpen}
        library={library}
        onClose={() => setLibraryFormOpen(false)}
        onSaved={(updated: Library) => {
          setLibraryFormOpen(false);
          toast(`词库名称已更新为「${updated.name}」`);
        }}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={deleting ? () => undefined : () => setDeleteTarget(null)}
        title="删除这个单词？"
        eyebrow="DELETE WORD"
        size="sm"
        hideClose={deleting}
        closeOnBackdrop={!deleting}
        footer={
          <>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              保留单词
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? '正在删除…' : '确定删除'}
            </button>
          </>
        }
      >
        {deleteTarget && (
          <div className="delete-library">
            <div className="delete-library__name">
              <BookHeart size={17} /> {deleteTarget.word}
            </div>
            <p>
              这个单词的内容和学习状态会一起删除。已经完成的会话记录会保留，但它将不再出现在学习队列里。
            </p>
            <div className="soft-note soft-note--warning">
              <Sparkles size={16} />
              <span>如果这个单词正在未完成的学习会话中，需要先完成会话才能删除。</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
