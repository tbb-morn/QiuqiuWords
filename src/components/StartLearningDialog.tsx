import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  BookHeart,
  Clock3,
  LoaderCircle,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import { db } from '../db/db';
import {
  getLibrariesWithCounts,
  sessionHasLearningActivity,
  startSession,
} from '../db/repositories';
import { errorMessage } from '../lib/errors';
import { formatShortDate, getSessionProgress } from '../lib/utils';
import type { LibraryWithCounts } from '../types';
import { Modal } from './Modal';
import { EmptyState } from './UI';
import { useToast } from './ToastProvider';

interface StartLearningDialogProps {
  open: boolean;
  onClose: () => void;
  onStarted: (sessionId: string) => void;
  onCreateLibrary: () => void;
}

export function StartLearningDialog({
  open,
  onClose,
  onStarted,
  onCreateLibrary,
}: StartLearningDialogProps) {
  const libraries = useLiveQuery(getLibrariesWithCounts, [], undefined);
  const recentSessions = useLiveQuery(
    async () => db.sessions.orderBy('updatedAt').reverse().limit(30).toArray(),
    [],
    undefined,
  );
  const [startingId, setStartingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setSearch('');
      setTagFilter('');
    }
  }, [open]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const library of libraries ?? []) {
      for (const tag of library.tags ?? []) tags.add(tag);
    }
    return [...tags].sort((a, b) =>
      a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }),
    );
  }, [libraries]);

  const activeTag = tagFilter && allTags.includes(tagFilter) ? tagFilter : '';

  const filteredLibraries = useMemo(() => {
    if (!libraries) return [];
    const query = search.trim().toLocaleLowerCase('zh-CN');
    return libraries.filter((library) => {
      if (activeTag && !(library.tags ?? []).includes(activeTag)) return false;
      if (!query) return true;
      return (
        library.name.toLocaleLowerCase('zh-CN').includes(query) ||
        library.description.toLocaleLowerCase('zh-CN').includes(query) ||
        (library.tags ?? []).some((tag) =>
          tag.toLocaleLowerCase('zh-CN').includes(query),
        )
      );
    });
  }, [libraries, search, activeTag]);

  const lastStudy = useMemo(() => {
    if (!libraries || !recentSessions) return null;
    for (const session of recentSessions) {
      if (!sessionHasLearningActivity(session)) continue;
      const library = libraries.find((item) => item.id === session.libraryId);
      if (library) return { library, session };
    }
    return null;
  }, [libraries, recentSessions]);

  const handleStart = async (library: LibraryWithCounts) => {
    if (startingId) return;
    setStartingId(library.id);
    try {
      const result = await startSession(library.id);
      onClose();
      onStarted(result.session.id);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setStartingId(null);
    }
  };

  const renderLibraryRow = (library: LibraryWithCounts) => {
    const active = library.activeSession;
    const current = active ? getSessionProgress(active) : null;
    const allMastered =
      library.wordCount > 0 && library.masteredCount >= library.wordCount;
    const disabled = library.wordCount === 0 || allMastered || Boolean(startingId);

    return (
      <button
        type="button"
        className="picker-row"
        key={library.id}
        onClick={() => void handleStart(library)}
        disabled={disabled && startingId !== library.id}
      >
        <span className="picker-row__icon">
          <BookHeart size={20} />
        </span>
        <span className="picker-row__main">
          <span className="picker-row__title">
            {library.name}
            {active && <span className="mini-badge mini-badge--mint">进行中</span>}
          </span>
          <span className="picker-row__meta">
            {library.wordCount === 0
              ? '还没有单词'
              : allMastered
                ? '所有单词都已熟练掌握'
                : active && current
                  ? `第 ${current.round.number} 轮 · ${current.answered} / ${current.total} · 学习 ${library.studyCount} 次`
                  : `${library.wordCount} 个单词 · ${library.masteredCount} 个已熟练掌握 · 学习 ${library.studyCount} 次`}
          </span>
        </span>
        <span className="picker-row__action">
          {startingId === library.id ? (
            <LoaderCircle size={18} className="spin" />
          ) : active ? (
            <>
              继续 <ArrowRight size={15} />
            </>
          ) : disabled ? (
            <Sparkles size={16} />
          ) : (
            <>
              开始 <ArrowRight size={15} />
            </>
          )}
        </span>
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={startingId ? () => undefined : onClose}
      title="今天想学哪个词库？"
      eyebrow="START LEARNING"
      description="每一轮都会把单词重新打乱。错词会自动进入下一轮，直到全部认识。"
      size="lg"
      closeOnBackdrop={!startingId}
      hideClose={Boolean(startingId)}
    >
      <div className="library-picker">
        {libraries === undefined ? (
          <div className="inline-loading">正在翻找词库…</div>
        ) : libraries.length === 0 ? (
          <EmptyState
            compact
            mascotSize={100}
            title="还没有词库呢"
            description="先建一个小词库，再一起开始吧。"
            action={
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  onClose();
                  onCreateLibrary();
                }}
              >
                <BookHeart size={16} /> 创建第一个词库
              </button>
            }
          />
        ) : (
          <>
            <div className="library-picker__filters">
              <div className="search-box library-picker__search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索词库名称、描述或标签…"
                  aria-label="搜索要学习的词库"
                />
              </div>
              {allTags.length > 0 && (
                <label className="toolbar__tag-filter library-picker__tag-filter">
                  <Tag size={14} />
                  <select
                    value={activeTag}
                    onChange={(event) => setTagFilter(event.target.value)}
                    aria-label="按标签筛选要学习的词库"
                  >
                    <option value="">全部标签</option>
                    {allTags.map((tag) => (
                      <option value={tag} key={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {filteredLibraries.length === 0 ? (
              <EmptyState
                compact
                mascotSize={90}
                title={activeTag ? `没有带「${activeTag}」标签的词库` : '没有找到这个词库'}
                description="换个关键词或标签试试，或者清空筛选看看全部词库。"
                action={
                  <button
                    type="button"
                    className="button button--soft button--sm"
                    onClick={() => {
                      setSearch('');
                      setTagFilter('');
                    }}
                  >
                    清空筛选
                  </button>
                }
              />
            ) : (
              <>
                {!search && !activeTag && lastStudy && (
                  <section className="library-picker__last">
                    <div className="library-picker__section-title">
                      <Clock3 size={15} />
                      <span>上次学习</span>
                      <small>{formatShortDate(lastStudy.session.updatedAt)}</small>
                    </div>
                    {renderLibraryRow(lastStudy.library)}
                  </section>
                )}

                <div className="library-picker__list">
                  {filteredLibraries.map(renderLibraryRow)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
