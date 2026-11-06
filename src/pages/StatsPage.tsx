import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookHeart,
  CalendarDays,
  CircleCheck,
  Clock3,
  Flame,
  Layers3,
  LibraryBig,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { StudySession } from '../types';
import type { RepeatedWrongWord } from '../db/repositories';
import { deleteSession, getDashboardStats } from '../db/repositories';
import { formatShortDate } from '../lib/utils';
import { EmptyState, PageLoader } from '../components/UI';
import { Mascot } from '../components/Mascot';
import { Modal } from '../components/Modal';
import { useToast } from '../components/ToastProvider';

const PREVIEW_LIMIT = 10;

function sessionStatus(session: StudySession): { label: string; tone: string } {
  if (session.status === 'completed') return { label: '全部通关', tone: 'mint' };
  if (session.status === 'abandoned') return { label: '已中断', tone: 'neutral' };
  if (session.stage === 'summary') return { label: '轮次总结', tone: 'butter' };
  return { label: '进行中', tone: 'peach' };
}

function sessionWordTotal(session: StudySession): number {
  return session.rounds.reduce((sum, round) => sum + round.queue.length, 0);
}

function WrongWordRow({ item, index }: { item: RepeatedWrongWord; index: number }) {
  return (
    <div className="wrong-word-row">
      <span className="wrong-word-row__rank">{index + 1}</span>
      <div className="wrong-word-row__word">
        <strong>{item.word.word}</strong>
        <span>{item.libraryName}</span>
      </div>
      <div className="wrong-word-row__meaning">
        {item.word.definitions[0]?.meaning || '还没有释义'}
      </div>
      <span className="wrong-word-row__count">
        <Flame size={12} /> 答错 {item.wrongCount} 次
      </span>
    </div>
  );
}

function SessionHistoryRow({
  session,
  onDelete,
}: {
  session: StudySession;
  onDelete: (session: StudySession) => void;
}) {
  const status = sessionStatus(session);
  const completedRounds = session.rounds.filter((round) => round.completedAt).length;
  return (
    <div className="session-history__row">
      <span className="session-history__icon">
        {session.status === 'completed' ? (
          <CircleCheck size={18} />
        ) : session.status === 'abandoned' ? (
          <Clock3 size={18} />
        ) : (
          <TrendingUp size={18} />
        )}
      </span>
      <div className="session-history__main">
        <div>
          <strong>{session.libraryName}</strong>
          {session.libraryDeleted && <span className="mini-badge">词库已删除</span>}
        </div>
        <span>
          {session.rounds.length} 轮 · {sessionWordTotal(session)} 个单词次
          {completedRounds > 0 ? ` · 完成 ${completedRounds} 轮` : ''}
        </span>
      </div>
      <span className={`status-pill status-pill--${status.tone}`}>{status.label}</span>
      <span className="session-history__date">
        <CalendarDays size={13} />
        {formatShortDate(session.completedAt ?? session.updatedAt)}
      </span>
      {session.status === 'in_progress' && (
        <Link to={`/study/${session.id}`} className="session-history__continue">
          继续 <ArrowRight size={13} />
        </Link>
      )}
      <button
        type="button"
        className="icon-button icon-button--danger-ghost session-history__delete"
        onClick={() => onDelete(session)}
        aria-label={`删除 ${session.libraryName} 的学习记录`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function StatsPage() {
  const stats = useLiveQuery(getDashboardStats, [], undefined);
  const { toast } = useToast();
  const [detail, setDetail] = useState<'wrong' | 'sessions' | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<StudySession | null>(
    null,
  );
  const [deletingSession, setDeletingSession] = useState(false);

  if (stats === undefined) {
    return (
      <div className="page-inner">
        <PageLoader label="正在数一数你的学习足迹…" />
      </div>
    );
  }

  const libraryPreview = stats.libraryWordCounts.slice(0, PREVIEW_LIMIT);
  const wrongPreview = stats.repeatedWrongWords.slice(0, PREVIEW_LIMIT);
  const sessionPreview = stats.recentSessions.slice(0, PREVIEW_LIMIT);

  const requestDeleteSession = (session: StudySession) => {
    setDetail(null);
    setDeleteSessionTarget(session);
  };

  const closeDeleteSession = () => {
    if (deletingSession) return;
    setDeleteSessionTarget(null);
  };

  const confirmDeleteSession = async () => {
    if (!deleteSessionTarget || deletingSession) return;
    setDeletingSession(true);
    try {
      await deleteSession(deleteSessionTarget.id);
      toast('这条学习记录已经删除了');
      setDeleteSessionTarget(null);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : '删除失败，请再试一次', 'error');
    } finally {
      setDeletingSession(false);
    }
  };

  return (
    <div className="page-inner stats-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">LEARNING FOOTPRINT</p>
          <h1>学习统计</h1>
          <p className="page-heading__sub">每一个数字，都来自你真实保存下来的学习记录。</p>
        </div>
        <Link to="/libraries" className="button button--soft">
          <LibraryBig size={16} /> 我的词库
        </Link>
      </header>

      <div className="stats-overview">
        <div className="stats-tile stats-tile--rose">
          <span className="stats-tile__icon">
            <Target size={20} />
          </span>
          <div>
            <span>累计学习单词</span>
            <strong>{stats.studiedWordCount}</strong>
            <small>至少做出过一次判断的单词</small>
          </div>
        </div>
        <div className="stats-tile stats-tile--mint">
          <span className="stats-tile__icon">
            <CircleCheck size={20} />
          </span>
          <div>
            <span>完成学习会话</span>
            <strong>{stats.completedSessionCount}</strong>
            <small>从头到尾全部通关</small>
          </div>
        </div>
        <div className="stats-tile stats-tile--butter">
          <span className="stats-tile__icon">
            <Layers3 size={20} />
          </span>
          <div>
            <span>完成学习轮次</span>
            <strong>{stats.completedRoundCount}</strong>
            <small>每一轮都算一次认真复习</small>
          </div>
        </div>
        <div className="stats-tile stats-tile--lavender">
          <span className="stats-tile__icon">
            <BookHeart size={20} />
          </span>
          <div>
            <span>词库与单词</span>
            <strong>
              {stats.totalLibraries}
              <em> / </em>
              {stats.totalWords}
            </strong>
            <small>个词库 / 个单词</small>
          </div>
        </div>
      </div>

      <div className="stats-layout">
        <section className="stats-panel">
          <div className="section-heading section-heading--small">
            <div>
              <p className="eyebrow">LIBRARIES</p>
              <h2>各词库单词</h2>
            </div>
            <div className="section-heading__aside">
              {stats.libraryWordCounts.length > 0 && (
                <Link to="/libraries" className="text-button">
                  查看全部 <ArrowRight size={13} />
                </Link>
              )}
              <LibraryBig size={19} className="section-heading__icon" />
            </div>
          </div>

          {stats.libraryWordCounts.length === 0 ? (
            <EmptyState
              compact
              mascotSize={88}
              title="还没有词库"
              description="添加词库后，这里会显示每个词库的单词数量。"
              action={
                <Link to="/libraries" className="button button--soft button--sm">
                  去创建词库
                </Link>
              }
            />
          ) : (
            <div className="library-stat-list">
              {libraryPreview.map(({ library, wordCount, masteredCount, studyCount }) => {
                const percent = wordCount > 0 ? Math.round((masteredCount / wordCount) * 100) : 0;
                return (
                  <Link to={`/libraries/${library.id}`} className="library-stat-row" key={library.id}>
                    <div className="library-stat-row__main">
                      <div>
                        <strong>{library.name}</strong>
                        <span>
                          {wordCount} 个单词 · 学习 {studyCount} 次
                        </span>
                      </div>
                      <span className="library-stat-row__mastered">
                        <Sparkles size={13} /> {masteredCount} 已熟练 · {percent}%
                      </span>
                    </div>
                    <div className="progress-track progress-track--thin">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="stats-panel">
          <div className="section-heading section-heading--small">
            <div>
              <p className="eyebrow">REPEATED MISTAKES</p>
              <h2>反复答错的单词</h2>
            </div>
            <div className="section-heading__aside">
              {stats.repeatedWrongWords.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setDetail('wrong')}
                >
                  查看全部 <ArrowRight size={13} />
                </button>
              )}
              <Flame size={19} className="section-heading__icon" />
            </div>
          </div>

          {stats.repeatedWrongWords.length === 0 ? (
            <EmptyState
              compact
              mascotSize={88}
              title="还没有反复答错的单词"
              description="学习几轮之后，这里会记录那些总是和你擦肩而过的词。"
              action={
                <Link to="/" className="button button--soft button--sm">
                  开始学习 <ArrowRight size={14} />
                </Link>
              }
            />
          ) : (
            <div className="wrong-word-list">
              {wrongPreview.map((item, index) => (
                <WrongWordRow item={item} index={index} key={item.word.id} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="stats-panel stats-panel--recent">
        <div className="section-heading section-heading--small">
          <div>
            <p className="eyebrow">RECENT SESSIONS</p>
            <h2>最近学习记录</h2>
          </div>
          <div className="section-heading__aside">
            {stats.recentSessions.length > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => setDetail('sessions')}
              >
                查看全部 <ArrowRight size={13} />
              </button>
            )}
            <Clock3 size={19} className="section-heading__icon" />
          </div>
        </div>

        {stats.recentSessions.length === 0 ? (
          <EmptyState
            compact
            mascotSize={88}
            title="还没有学习记录"
            description="第一次学习会自动保存在这里，随时可以回来看看。"
            action={
              <Link to="/" className="button button--primary button--sm">
                回到首页开始
              </Link>
            }
          />
        ) : (
          <div className="session-history">
            {sessionPreview.map((session) => (
              <SessionHistoryRow
                session={session}
                key={session.id}
                onDelete={requestDeleteSession}
              />
            ))}
          </div>
        )}
      </section>

      <div className="stats-footnote">
        <BarChart3 size={16} />
        <p>
          统计只计算真实保存的学习判断：累计学习单词数为去重后的已判断单词；反复答错次数来自每一轮中最终保存的「不认识」判断，选错了造成的修改也会如实反映。
        </p>
        <Mascot size={66} />
      </div>

      <Modal
        open={detail === 'wrong'}
        onClose={() => setDetail(null)}
        title="全部反复答错的单词"
        eyebrow="REPEATED MISTAKES"
        description={`共 ${stats.repeatedWrongWords.length} 个，按累计答错次数从高到低排列。`}
        size="lg"
        footer={
          <button type="button" className="button button--soft" onClick={() => setDetail(null)}>
            关闭
          </button>
        }
      >
        <div className="wrong-word-list wrong-word-list--detail">
          {stats.repeatedWrongWords.map((item, index) => (
            <WrongWordRow item={item} index={index} key={item.word.id} />
          ))}
        </div>
      </Modal>

      <Modal
        open={detail === 'sessions'}
        onClose={() => setDetail(null)}
        title="全部学习记录"
        eyebrow="RECENT SESSIONS"
        description={`共 ${stats.recentSessions.length} 条，按最近更新时间排列。`}
        size="lg"
        footer={
          <button type="button" className="button button--soft" onClick={() => setDetail(null)}>
            关闭
          </button>
        }
      >
        <div className="session-history session-history--detail">
          {stats.recentSessions.map((session) => (
            <SessionHistoryRow
              session={session}
              key={session.id}
              onDelete={requestDeleteSession}
            />
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteSessionTarget)}
        onClose={closeDeleteSession}
        title="删除这条学习记录？"
        eyebrow="DELETE SESSION"
        size="sm"
        hideClose={deletingSession}
        closeOnBackdrop={!deletingSession}
        footer={
          <>
            <button
              type="button"
              className="button button--ghost"
              onClick={closeDeleteSession}
              disabled={deletingSession}
            >
              保留记录
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={() => void confirmDeleteSession()}
              disabled={deletingSession}
            >
              {deletingSession ? '正在删除…' : '确定删除'}
            </button>
          </>
        }
      >
        {deleteSessionTarget && (
          <div className="delete-library">
            <div className="delete-library__name">
              <Trash2 size={17} /> {deleteSessionTarget.libraryName}
            </div>
            <p>只会删除这一次学习会话，以及它在学习统计里的记录。</p>
            <ul>
              <li>单词内容和词库不会删除</li>
              <li>单词的认识 / 不认识 / 熟练掌握状态不会改变</li>
              <li>
                {deleteSessionTarget.status === 'in_progress'
                  ? '这次学习还没有完成，删除后不能从首页或这里继续'
                  : '这条通关记录会从学习历史中移除'}
              </li>
            </ul>
            <div className="soft-note soft-note--warning">
              <Trash2 size={16} />
              <span>删除后无法撤销；其他学习记录和词库不受影响。</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
