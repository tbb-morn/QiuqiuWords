import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpDown,
  BookHeart,
  BookOpen,
  CheckSquare2,
  Download,
  FileSpreadsheet,
  FolderUp,
  LibraryBig,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Library, LibraryWithCounts, Word } from '../types';
import { db } from '../db/db';
import {
  deleteLibrariesCascade,
  deleteLibraryCascade,
  getLibrariesWithCounts,
} from '../db/repositories';
import { errorMessage } from '../lib/errors';
import {
  cn,
  downloadTextFile,
  safeFileName,
  sortLibrariesByName,
  sortLibrariesForDisplay,
  type LibrarySortMode,
} from '../lib/utils';
import { libraryBundleToJson, wordsToCsv, wordsToJson } from '../lib/transfer';
import { LibraryFormModal } from '../components/LibraryFormModal';
import { ImportLibrariesDialog } from '../components/ImportLibrariesDialog';
import { ImportWordsDialog } from '../components/ImportWordsDialog';
import { ActionMenu, EmptyState, PageLoader } from '../components/UI';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const SORT_STORAGE_KEY = 'qiuqiu-library-sort';

function readSavedSortMode(): LibrarySortMode {
  try {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (saved === 'name' || saved === 'updated' || saved === 'created') return saved;
  } catch {
    // 浏览器禁用本地存储时使用默认排序。
  }
  return 'name';
}

export function LibrariesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const libraries = useLiveQuery(getLibrariesWithCounts, [], undefined);
  const [sortMode, setSortMode] = useState<LibrarySortMode>(readSavedSortMode);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null);
  const [importTarget, setImportTarget] = useState<Library | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryWithCounts | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [bundleImportOpen, setBundleImportOpen] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState<1 | 2>(1);
  const [batchDeleting, setBatchDeleting] = useState(false);

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

  const filtered = useMemo(() => {
    if (!libraries) return [];
    const query = search.trim().toLocaleLowerCase('zh-CN');
    const matched = libraries.filter((library) => {
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
    return sortLibrariesForDisplay(matched, sortMode);
  }, [libraries, search, sortMode, activeTag]);

  const changeSortMode = (value: string) => {
    const mode: LibrarySortMode =
      value === 'updated' || value === 'created' ? value : 'name';
    setSortMode(mode);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, mode);
    } catch {
      // 忽略禁用本地存储的情况。
    }
  };

  const totalWords = libraries?.reduce((sum, library) => sum + library.wordCount, 0) ?? 0;
  const selectedLibraries = useMemo(
    () => (libraries ?? []).filter((library) => selectedIds.has(library.id)),
    [libraries, selectedIds],
  );
  const selectedWordCount = selectedLibraries.reduce(
    (sum, library) => sum + library.wordCount,
    0,
  );
  const selectedActiveCount = selectedLibraries.filter(
    (library) => library.activeSession,
  ).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((library) => selectedIds.has(library.id));

  const enterSelecting = () => {
    setSelectedIds(new Set());
    setSelecting(true);
  };

  const exitSelecting = () => {
    if (batchDeleting) return;
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(current);
      for (const library of filtered) next.add(library.id);
      return next;
    });
  };

  const openCreate = () => {
    setEditingLibrary(null);
    setFormOpen(true);
  };

  const openEdit = (library: Library) => {
    setEditingLibrary(library);
    setFormOpen(true);
  };

  const handleSaved = (library: Library) => {
    setFormOpen(false);
    if (editingLibrary) {
      toast('词库信息已经更新');
    } else {
      toast('新词库创建好啦');
      navigate(`/libraries/${library.id}`);
    }
  };

  const openDelete = (library: LibraryWithCounts) => {
    setDeleteTarget(library);
    setDeleteStep(1);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteStep(1);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteLibraryCascade(deleteTarget.id);
      toast(`「${deleteTarget.name}」已删除，学习历史仍然保留`);
      setDeleteTarget(null);
      setDeleteStep(1);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteStep(1);
    setBatchDeleteOpen(true);
  };

  const closeBatchDelete = () => {
    if (batchDeleting) return;
    setBatchDeleteOpen(false);
    setBatchDeleteStep(1);
  };

  const confirmBatchDelete = async () => {
    if (selectedLibraries.length === 0 || batchDeleting) return;
    setBatchDeleting(true);
    try {
      const deleted = await deleteLibrariesCascade(
        selectedLibraries.map((library) => library.id),
      );
      toast(`已删除 ${deleted} 个词库，学习历史仍然保留`);
      setBatchDeleteOpen(false);
      setBatchDeleteStep(1);
      setSelecting(false);
      setSelectedIds(new Set());
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setBatchDeleting(false);
    }
  };

  const exportAllLibraries = async () => {
    if (exportingAll) return;
    if (!libraries || libraries.length === 0) {
      toast('还没有词库可以导出', 'info');
      return;
    }
    setExportingAll(true);
    try {
      const [allLibrariesRaw, allWords] = await Promise.all([
        db.libraries.toArray(),
        db.words.toArray(),
      ]);
      const allLibraries = sortLibrariesByName(allLibrariesRaw);
      const wordsByLibrary = new Map<string, Word[]>();
      for (const word of allWords) {
        const list = wordsByLibrary.get(word.libraryId) ?? [];
        list.push(word);
        wordsByLibrary.set(word.libraryId, list);
      }
      const sources = allLibraries.map((library) => ({
        library,
        words: (wordsByLibrary.get(library.id) ?? []).sort((a, b) =>
          a.word.localeCompare(b.word, 'en'),
        ),
      }));
      const total = sources.reduce((sum, item) => sum + item.words.length, 0);
      const date = new Date().toISOString().slice(0, 10);
      downloadTextFile(
        `丘丘背单词-词库合集-${date}.json`,
        libraryBundleToJson(sources),
        'application/json;charset=utf-8',
      );
      toast(`已导出 ${allLibraries.length} 个词库，共 ${total} 个单词`);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setExportingAll(false);
    }
  };

  const exportLibrary = async (library: Library, format: 'csv' | 'json') => {
    if (exportingId) return;
    setExportingId(library.id);
    try {
      const words = await db.words.where('libraryId').equals(library.id).toArray();
      if (words.length === 0) {
        toast('这个词库还没有单词可以导出', 'info');
        return;
      }
      words.sort((a, b) => a.word.localeCompare(b.word, 'en'));
      const base = `${safeFileName(library.name)}-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'csv') {
        downloadTextFile(`${base}.csv`, wordsToCsv(words), 'text/csv;charset=utf-8');
      } else {
        downloadTextFile(`${base}.json`, wordsToJson(library, words), 'application/json;charset=utf-8');
      }
      toast(`已导出 ${words.length} 个单词（${format.toUpperCase()}）`);
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setExportingId(null);
    }
  };

  if (libraries === undefined) {
    return (
      <div className="page-inner">
        <PageLoader label="正在整理你的词库…" />
      </div>
    );
  }

  return (
    <div className="page-inner libraries-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">MY LIBRARIES</p>
          <h1>我的词库</h1>
          <p className="page-heading__sub">
            {libraries.length > 0
              ? `一共 ${libraries.length} 个小词库，装着 ${totalWords} 个单词。`
              : '这里会装下所有你亲手收集的单词。'}
          </p>
        </div>
        <div className="page-heading__actions">
          <button
            type="button"
            className="button button--soft"
            onClick={() => setBundleImportOpen(true)}
          >
            <FolderUp size={16} /> 导入 JSON 词库
          </button>
          <button
            type="button"
            className="button button--soft"
            onClick={() => void exportAllLibraries()}
            disabled={exportingAll || libraries.length === 0}
          >
            <Download size={16} /> {exportingAll ? '正在导出…' : '导出全部'}
          </button>
          <button type="button" className="button button--primary" onClick={openCreate}>
            <Plus size={17} /> 新建词库
          </button>
        </div>
      </header>

      {libraries.length > 0 && (
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索词库名称、描述或标签…"
              aria-label="搜索词库"
            />
          </div>
          <label className="toolbar__sort">
            <ArrowUpDown size={14} />
            <select
              value={sortMode}
              onChange={(event) => changeSortMode(event.target.value)}
              aria-label="词库排序方式"
            >
              <option value="name">首字母顺序</option>
              <option value="updated">最近修改</option>
              <option value="created">最近创建</option>
            </select>
          </label>
          {allTags.length > 0 && (
            <label className="toolbar__tag-filter">
              <Tag size={14} />
              <select
                value={activeTag}
                onChange={(event) => setTagFilter(event.target.value)}
                aria-label="按标签筛选词库"
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
          <div className="toolbar__actions">
            {selecting ? (
              <>
                <span className="toolbar__selected">已选 {selectedLibraries.length} 个</span>
                <button type="button" className="text-button" onClick={toggleSelectAll}>
                  {allFilteredSelected ? '取消全选' : '全选'}
                </button>
                <button
                  type="button"
                  className="button button--danger button--sm"
                  onClick={openBatchDelete}
                  disabled={selectedLibraries.length === 0 || batchDeleting}
                >
                  <Trash2 size={14} /> 删除所选
                </button>
                <button type="button" className="text-button" onClick={exitSelecting}>
                  退出批量
                </button>
              </>
            ) : (
              <>
                <span className="toolbar__count">
                  {filtered.length === libraries.length
                    ? '全部词库'
                    : `找到 ${filtered.length} 个词库`}
                </span>
                <button type="button" className="text-button" onClick={enterSelecting}>
                  批量管理
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {libraries.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="从第一个小词库开始"
            description="自己建一个，或一键导入别人分享的词库合集。"
            action={
              <div className="button-row">
                <button type="button" className="button button--primary" onClick={openCreate}>
                  <Plus size={17} /> 创建第一个词库
                </button>
                <button
                  type="button"
                  className="button button--soft"
                  onClick={() => setBundleImportOpen(true)}
                >
                  <FolderUp size={16} /> 导入 JSON 词库
                </button>
              </div>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            compact
            mascotSize={100}
            title={activeTag ? `没有标签「${activeTag}」的词库` : '没有找到这个词库'}
            description={
              activeTag
                ? '换一个标签看看，或者清除筛选。'
                : '换个关键词试试吧，或者创建一个新的。'
            }
            action={
              <button
                type="button"
                className="button button--soft"
                onClick={() => {
                  setSearch('');
                  setTagFilter('');
                }}
              >
                清除筛选
              </button>
            }
          />
        </div>
      ) : (
        <div className="library-grid">
          {filtered.map((library, index) => {
            const tone = ['rose', 'mint', 'butter', 'lavender'][index % 4];
            const masteredPercent =
              library.wordCount > 0
                ? Math.round((library.masteredCount / library.wordCount) * 100)
                : 0;
            return (
              <article
                className={`library-card library-card--${tone}${
                  selecting ? ' library-card--selecting' : ''
                }${selectedIds.has(library.id) ? ' is-selected' : ''}`}
                key={library.id}
                onClick={() =>
                  selecting ? toggleSelected(library.id) : navigate(`/libraries/${library.id}`)
                }
              >
                <div className="library-card__top">
                  <span className="library-card__icon">
                    <BookHeart size={22} />
                  </span>
                  {selecting ? (
                    <button
                      type="button"
                      className={`library-card__check ${
                        selectedIds.has(library.id) ? 'is-on' : ''
                      }`}
                      aria-label={`${selectedIds.has(library.id) ? '取消选择' : '选择'}${library.name}`}
                      aria-pressed={selectedIds.has(library.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSelected(library.id);
                      }}
                    >
                      {selectedIds.has(library.id) ? (
                        <CheckSquare2 size={23} />
                      ) : (
                        <Square size={23} />
                      )}
                    </button>
                  ) : (
                    <div className="library-card__menu">
                      <ActionMenu
                        items={[
                          {
                            label: '编辑词库信息',
                            icon: Pencil,
                            onSelect: () => openEdit(library),
                          },
                          {
                            label: '导入 CSV 单词',
                            icon: FileSpreadsheet,
                            hint: '往这个词库添加 / 更新单词',
                            onSelect: () => setImportTarget(library),
                          },
                          {
                            label: '导出 CSV',
                            icon: Download,
                            disabled: exportingId === library.id,
                            onSelect: () => void exportLibrary(library, 'csv'),
                          },
                          {
                            label: '导出 JSON',
                            icon: Download,
                            disabled: exportingId === library.id,
                            onSelect: () => void exportLibrary(library, 'json'),
                          },
                          {
                            label: '删除词库',
                            icon: Trash2,
                            danger: true,
                            onSelect: () => openDelete(library),
                          },
                        ]}
                        label={`${library.name} 的更多操作`}
                      />
                    </div>
                  )}
                </div>

                <div className="library-card__body">
                  <div className="library-card__title-row">
                    <h2>{library.name}</h2>
                    {library.activeSession && (
                      <span className="mini-badge mini-badge--mint">
                        <span className="pulse-dot" /> 学习中
                      </span>
                    )}
                  </div>
                  <p>{library.description || '还没有描述，点进来看一看吧。'}</p>
                  {(library.tags ?? []).length > 0 && (
                    <div className="library-card__tags">
                      {(library.tags ?? []).map((tag) => (
                        <button
                          type="button"
                          className={cn(
                            'library-tag',
                            activeTag === tag && 'is-active',
                          )}
                          key={tag}
                          disabled={selecting}
                          onClick={(event) => {
                            event.stopPropagation();
                            setTagFilter((current) => (current === tag ? '' : tag));
                          }}
                          aria-label={`按标签「${tag}」筛选`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="library-card__meta">
                  <span className="meta-pill">
                    <strong>{library.wordCount}</strong> 个单词
                  </span>
                  <span className="meta-pill">
                    <Sparkles size={13} /> {library.masteredCount} 已熟练
                  </span>
                  <span className="meta-pill">
                    <BookOpen size={13} /> 学习 {library.studyCount} 次
                  </span>
                </div>

                <div className="library-card__footer">
                  <div className="mini-progress">
                    <div className="mini-progress__bar">
                      <span style={{ width: `${masteredPercent}%` }} />
                    </div>
                    <small>熟练掌握 {masteredPercent}%</small>
                  </div>
                  <span className="library-card__go">
                    {selecting
                      ? selectedIds.has(library.id)
                        ? '已选择'
                        : '点击选择'
                      : '进入词库'}{' '}
                    {!selecting && <ArrowRight size={15} />}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {libraries.length > 0 && (
        <div className="library-manage-note">
          <LibraryBig size={18} />
          <p>
            词库与学习记录都只保存在当前浏览器里。换电脑前可以导出 JSON
            保留单词内容；学习状态与历史记录不会随导出文件迁移。
          </p>
        </div>
      )}

      <LibraryFormModal
        open={formOpen}
        library={editingLibrary}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      {importTarget && (
        <ImportWordsDialog
          open
          library={importTarget}
          onClose={() => setImportTarget(null)}
          onImported={() => setImportTarget(null)}
        />
      )}

      <ImportLibrariesDialog
        open={bundleImportOpen}
        onClose={() => setBundleImportOpen(false)}
        onImported={() => setBundleImportOpen(false)}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        title={deleteStep === 1 ? '要删除这个词库吗？' : '最后确认一次'}
        eyebrow="DELETE LIBRARY"
        size="sm"
        hideClose={deleting}
        closeOnBackdrop={!deleting}
        footer={
          deleteStep === 1 ? (
            <>
              <button type="button" className="button button--ghost" onClick={closeDelete}>
                保留词库
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => setDeleteStep(2)}
              >
                我了解，继续
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setDeleteStep(1)}
                disabled={deleting}
              >
                返回上一步
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? '正在删除…' : '确定删除词库'}
              </button>
            </>
          )
        }
      >
        {deleteTarget && (
          <div className="delete-library">
            <div className="delete-library__name">
              <BookHeart size={17} /> {deleteTarget.name}
            </div>
            {deleteStep === 1 ? (
              <>
                <p>删除后，这个词库里的以下数据会一起移除：</p>
                <ul>
                  <li>{deleteTarget.wordCount} 个单词及全部单词内容</li>
                  <li>这些单词的认识 / 不认识 / 熟练掌握状态</li>
                  <li>
                    {deleteTarget.activeSession
                      ? '正在进行的学习会话会被终止'
                      : '关联的学习会话会从进行中列表移除'}
                  </li>
                </ul>
                <div className="soft-note soft-note--warning">
                  <Upload size={16} />
                  <span>
                    已完成的通关记录与学习统计会保留，词库名称以删除时的快照显示。
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>
                  即将永久删除「{deleteTarget.name}」以及其中的 {deleteTarget.wordCount}{' '}
                  个单词。这个操作无法撤销。
                </p>
                <p className="delete-library__emphasis">
                  如果想留一份单词内容，请先返回并导出 JSON。
                </p>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={batchDeleteOpen}
        onClose={closeBatchDelete}
        title={
          batchDeleteStep === 1
            ? `要删除选中的 ${selectedLibraries.length} 个词库吗？`
            : '最后确认一次'
        }
        eyebrow="BATCH DELETE LIBRARIES"
        size="sm"
        hideClose={batchDeleting}
        closeOnBackdrop={!batchDeleting}
        footer={
          batchDeleteStep === 1 ? (
            <>
              <button type="button" className="button button--ghost" onClick={closeBatchDelete}>
                保留词库
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => setBatchDeleteStep(2)}
                disabled={selectedLibraries.length === 0}
              >
                我了解，继续
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setBatchDeleteStep(1)}
                disabled={batchDeleting}
              >
                返回上一步
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => void confirmBatchDelete()}
                disabled={batchDeleting || selectedLibraries.length === 0}
              >
                {batchDeleting
                  ? '正在删除…'
                  : `确定删除 ${selectedLibraries.length} 个词库`}
              </button>
            </>
          )
        }
      >
        <div className="delete-library">
          <div className="delete-library__name">
            <Trash2 size={17} /> 已选择 {selectedLibraries.length} 个词库
          </div>
          {batchDeleteStep === 1 ? (
            <>
              <p>删除后，这些词库里的以下数据会一起移除：</p>
              <ul>
                <li>{selectedWordCount} 个单词及全部单词内容</li>
                <li>这些单词的认识 / 不认识 / 熟练掌握状态</li>
                <li>
                  {selectedActiveCount > 0
                    ? `其中 ${selectedActiveCount} 个词库有正在进行的学习会话，会被终止`
                    : '关联的学习会话会从进行中列表移除'}
                </li>
              </ul>
              <div className="batch-delete-names">
                {selectedLibraries.map((library) => (
                  <span className="batch-delete-name" key={library.id}>
                    {library.name}
                  </span>
                ))}
              </div>
              <div className="soft-note soft-note--warning">
                <Upload size={16} />
                <span>
                  已完成的通关记录与学习统计会保留，词库名称以删除时的快照显示。
                </span>
              </div>
            </>
          ) : (
            <>
              <p>
                即将永久删除选中的 {selectedLibraries.length} 个词库，以及其中的{' '}
                {selectedWordCount} 个单词。这个操作无法撤销。
              </p>
              <p className="delete-library__emphasis">
                如果想留一份单词内容，请先返回并用「导出全部」保存 JSON。
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
