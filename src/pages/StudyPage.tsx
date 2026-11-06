import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  CircleCheck,
  Clock3,
  Feather,
  Flag,
  Heart,
  Home,
  Languages,
  Link2,
  LoaderCircle,
  Sparkles,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import type { StudyRound, StudySession, Word, WordProgress } from '../types';
import { db } from '../db/db';
import {
  answerCurrentWord,
  continueSession,
  correctCurrentWord,
  getSessionWords,
  goNextWord,
  goPreviousWord,
} from '../db/repositories';
import { errorMessage } from '../lib/errors';
import {
  formatDuration,
  getRoundStats,
  getSessionProgress,
  getUnknownWordIds,
  isTypingTarget,
  cn,
} from '../lib/utils';
import { Mascot } from '../components/Mascot';
import { useToast } from '../components/ToastProvider';
import { PageLoader } from '../components/UI';

type BusyAction = 'answer' | 'mastered' | 'previous' | 'next' | 'correct' | 'continue' | null;

interface StudyData {
  session: StudySession;
  words: Map<string, Word>;
  progress: Map<string, WordProgress>;
}

const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  left: `${(index * 17 + 8) % 100}%`,
  delay: `${(index % 9) * 0.18}s`,
  duration: `${2.4 + (index % 5) * 0.3}s`,
  color: ['#F3C4CB', '#BFDCCB', '#F5DCA7', '#D8CDEE', '#F1C8B5'][index % 5],
  size: `${6 + (index % 4) * 2}px`,
}));

export function StudyPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState<BusyAction>(null);

  const data = useLiveQuery(async (): Promise<StudyData | null> => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const [words, progress] = await Promise.all([
      getSessionWords(session),
      db.progress.where('libraryId').equals(session.libraryId).toArray(),
    ]);
    return {
      session,
      words,
      progress: new Map(progress.map((item) => [item.wordId, item])),
    };
  }, [sessionId], undefined);

  const run = async (action: BusyAction, operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(action);
    try {
      await operation();
    } catch (caught) {
      toast(errorMessage(caught), 'error');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!data || data.session.status !== 'in_progress' || data.session.stage !== 'studying') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (busy || event.repeat || isTypingTarget(event.target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      const session = data.session;
      const activeRound = session.rounds.at(-1);
      if (!activeRound || !activeRound.queue[activeRound.currentIndex]) return;

      event.preventDefault();

      if (activeRound.view === 'question') {
        const judgment = event.key === 'ArrowRight' ? 'known' : 'unknown';
        void run('answer', () => answerCurrentWord(session.id, judgment));
        return;
      }

      if (event.key === 'ArrowRight') {
        void run('next', () => goNextWord(session.id));
      } else {
        void run('correct', () => correctCurrentWord(session.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, busy]);

  if (data === undefined) {
    return (
      <div className="study-shell">
        <PageLoader label="正在恢复你的学习进度…" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="study-shell study-shell--center">
        <div className="study-missing">
          <Mascot size={160} />
          <h1>没有找到这个学习会话</h1>
          <p>它可能已经被删除，或链接不完整。</p>
          <button type="button" className="button button--primary" onClick={() => navigate('/')}>
            <Home size={16} /> 回到首页
          </button>
        </div>
      </div>
    );
  }

  const { session, words, progress } = data;
  const progressState = getSessionProgress(session);
  const round = progressState.round;
  const currentWordId = round.queue[round.currentIndex];
  const currentWord = currentWordId ? words.get(currentWordId) : undefined;
  const currentProgress = currentWordId ? progress.get(currentWordId) : undefined;
  const judgment = currentWordId ? round.judgments[currentWordId] : undefined;
  const stats = getRoundStats(round);

  if (session.status === 'abandoned') {
    return (
      <div className="study-shell study-shell--center">
        <div className="study-missing">
          <Mascot size={150} />
          <h1>这个学习会话已经停下了</h1>
          <p>关联的词库被删除了，会话记录仍留在学习历史里。</p>
          <button type="button" className="button button--primary" onClick={() => navigate('/')}>
            <Home size={16} /> 回到首页
          </button>
        </div>
      </div>
    );
  }

  if (session.stage === 'summary') {
    return (
      <RoundSummary
        round={round}
        rounds={session.rounds}
        libraryName={session.libraryName}
        completed={session.status === 'completed'}
        busy={busy === 'continue'}
        onContinue={() => void run('continue', () => continueSession(session.id))}
        onHome={() => navigate('/')}
        onStats={() => navigate('/stats')}
      />
    );
  }

  if (!currentWord) {
    return (
      <div className="study-shell study-shell--center">
        <div className="study-missing">
          <Mascot size={150} />
          <h1>这个单词暂时找不到了</h1>
          <p>单词可能在另一个窗口被删除。学习队列不会打乱，先回到首页再看看吧。</p>
          <button type="button" className="button button--primary" onClick={() => navigate('/')}>
            <Home size={16} /> 回到首页
          </button>
        </div>
      </div>
    );
  }

  const percent =
    progressState.total > 0 ? (progressState.answered / progressState.total) * 100 : 0;
  const roundComplete = progressState.answered >= progressState.total;
  const isLast = round.currentIndex >= round.queue.length - 1;

  return (
    <div className="study-shell">
      <header className="study-topbar">
        <button type="button" className="study-exit" onClick={() => navigate('/')}>
          <ChevronLeft size={17} />
          暂存并离开
        </button>
        <div className="study-topbar__library">
          <BookOpen size={15} />
          <span>{session.libraryName}</span>
        </div>
        <div className="study-topbar__round">
          第 {round.number} 轮
          <span className="study-topbar__divider" />
          {round.currentIndex + 1} / {round.queue.length}
        </div>
      </header>

      <div className="study-progress">
        <div className="study-progress__bar">
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      {round.view === 'question' ? (
        <main className="study-stage study-stage--question">
          <div className="study-card study-card--question">
            <div className="study-card__deco" aria-hidden="true">
              <span className="study-blob study-blob--one" />
              <span className="study-blob study-blob--two" />
              <Sparkles className="study-sparkle" size={20} />
            </div>
            <div className="study-caption">
              <span>第 {round.number} 轮</span>
              <span className="dot-separator">·</span>
              <span>
                {round.currentIndex + 1} / {round.queue.length}
              </span>
            </div>
            <div className="study-word" lang="en">
              {currentWord.word}
            </div>
            <div className="study-question-space" />
          </div>

          <div className="study-actions">
            <button
              type="button"
              className="study-prev"
              onClick={() => void run('previous', () => goPreviousWord(session.id))}
              disabled={Boolean(busy) || round.currentIndex === 0}
            >
              <ArrowLeft size={15} /> 上一词
            </button>

            <div className="study-answer-group">
              <button
                type="button"
                className="answer-button answer-button--unknown"
                onClick={() => void run('answer', () => answerCurrentWord(session.id, 'unknown'))}
                disabled={Boolean(busy)}
              >
                <span className="answer-button__icon">
                  {busy === 'answer' ? <LoaderCircle size={20} className="spin" /> : <XCircle size={20} />}
                </span>
                <span>
                  <strong>不认识</strong>
                  <small>下一轮再见</small>
                </span>
              </button>
              <button
                type="button"
                className="answer-button answer-button--known"
                onClick={() => void run('answer', () => answerCurrentWord(session.id, 'known'))}
                disabled={Boolean(busy)}
              >
                <span className="answer-button__icon">
                  <CircleCheck size={20} />
                </span>
                <span>
                  <strong>认识</strong>
                  <small>在心里叫出了名字</small>
                </span>
              </button>
            </div>

            <button
              type="button"
              className="master-button"
              onClick={() =>
                void run('mastered', () => answerCurrentWord(session.id, 'known', { mastered: true }))
              }
              disabled={Boolean(busy)}
            >
              <Star size={14} />
              已熟练掌握
            </button>
          </div>

          <p className="study-save-hint">每次判断都会自动保存</p>
          <p className="study-key-hint">
            <kbd>←</kbd> 不认识
            <span>·</span>
            <kbd>→</kbd> 认识
          </p>
        </main>
      ) : (
        <main className="study-stage study-stage--detail">
          <div className="study-detail-card">
            <div className="study-detail-card__head">
              <div>
                <div className="study-detail-card__badges">
                  <span
                    className={cn(
                      'status-pill',
                      judgment === 'known' ? 'status-pill--mint' : 'status-pill--peach',
                    )}
                  >
                    {judgment === 'known' ? (
                      <>
                        <Check size={12} /> 认识
                      </>
                    ) : (
                      <>
                        <X size={12} /> 不认识
                      </>
                    )}
                  </span>
                  {currentProgress?.mastered && (
                    <span className="status-pill status-pill--butter">
                      <Star size={12} fill="currentColor" /> 已熟练掌握
                    </span>
                  )}
                  <span className="study-detail-card__round">
                    第 {round.number} 轮 · {round.currentIndex + 1} / {round.queue.length}
                  </span>
                </div>
                <h1 lang="en">{currentWord.word}</h1>
                {currentWord.phonetic && <p className="study-phonetic">{currentWord.phonetic}</p>}
              </div>
              <div className="study-detail-card__stamp" aria-hidden="true">
                {judgment === 'known' ? <Check size={26} /> : <X size={26} />}
              </div>
            </div>

            <div className="study-detail-card__body">
              <StudyWordInfo word={currentWord} />
            </div>

            <div className="study-detail-card__stats">
              <span>
                <Check size={13} /> 本轮认识 {stats.known}
              </span>
              <span>
                <X size={13} /> 待复习 {stats.unknown}
              </span>
              <span>
                <Clock3 size={13} /> {formatDuration(stats.durationMs)}
              </span>
            </div>

            <div className="study-detail-actions">
              <button
                type="button"
                className="button button--ghost button--lg"
                onClick={() => void run('correct', () => correctCurrentWord(session.id))}
                disabled={Boolean(busy)}
              >
                <Heart size={16} /> 选错了
              </button>
              <button
                type="button"
                className="button button--primary button--lg"
                onClick={() => void run('next', () => goNextWord(session.id))}
                disabled={Boolean(busy)}
              >
                {busy === 'next' ? (
                  <>正在保存…</>
                ) : isLast && roundComplete ? (
                  <>
                    查看本轮总结 <Flag size={16} />
                  </>
                ) : (
                  <>
                    下一词 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
            <p className="study-key-hint">
              <kbd>←</kbd> 选错了
              <span>·</span>
              <kbd>→</kbd> 下一词
            </p>
          </div>
        </main>
      )}
    </div>
  );
}

function StudyWordInfo({ word }: { word: Word }) {
  return (
    <div className="study-word-info">
      {word.definitions.length > 0 && (
        <section>
          <h3>
            <BookOpen size={15} /> 释义
          </h3>
          <ul className="definition-list definition-list--study">
            {word.definitions.map((item, index) => (
              <li key={index}>
                {item.partOfSpeech && <em>{item.partOfSpeech}</em>}
                <span>{item.meaning}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {word.examples.length > 0 && (
        <section>
          <h3>
            <Feather size={15} /> 例句
          </h3>
          <div className="example-list example-list--study">
            {word.examples.map((example, index) => (
              <blockquote key={index}>
                <p>{example.en}</p>
                {example.zh && <footer>{example.zh}</footer>}
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {word.phrases.length > 0 && (
        <section>
          <h3>
            <Languages size={15} /> 常用词组
          </h3>
          {word.phrases.map((phrase, index) => (
            <div className="phrase-row" key={index}>
              <span>{phrase.en}</span>
              <span>{phrase.zh}</span>
            </div>
          ))}
        </section>
      )}

      {word.mnemonic && (
        <section>
          <h3>
            <Sparkles size={15} /> 巧记口诀
          </h3>
          <div className="mnemonic-note mnemonic-note--study">{word.mnemonic}</div>
        </section>
      )}

      {(word.derivatives.length > 0 || word.synonyms.length > 0 || word.antonyms.length > 0) && (
        <section>
          <h3>
            <Link2 size={15} /> 词族与联想
          </h3>
          <div className="relation-groups">
            {word.derivatives.length > 0 && (
              <div>
                <span className="relation-label">派生词</span>
                <div className="chip-wrap">
                  {word.derivatives.map((item) => (
                    <span className="soft-chip" key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {word.synonyms.length > 0 && (
              <div>
                <span className="relation-label">同义词</span>
                <div className="chip-wrap">
                  {word.synonyms.map((item) => (
                    <span className="soft-chip" key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
            {word.antonyms.length > 0 && (
              <div>
                <span className="relation-label">反义词</span>
                <div className="chip-wrap">
                  {word.antonyms.map((item) => (
                    <span className="soft-chip" key={item}>{item}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {word.note && (
        <section>
          <h3>个人备注</h3>
          <p className="note-text">{word.note}</p>
        </section>
      )}

      {word.customFields.length > 0 && (
        <section>
          <h3>自定义字段</h3>
          <dl className="custom-field-list">
            {word.customFields.map((field, index) => (
              <div key={index}>
                <dt>{field.label || '自定义'}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

interface RoundSummaryProps {
  round: StudyRound;
  rounds: StudyRound[];
  libraryName: string;
  completed: boolean;
  busy: boolean;
  onContinue: () => void;
  onHome: () => void;
  onStats: () => void;
}

function RoundSummary({
  round,
  rounds,
  libraryName,
  completed,
  busy,
  onContinue,
  onHome,
  onStats,
}: RoundSummaryProps) {
  const stats = getRoundStats(round);
  const unknownCount = getUnknownWordIds(round).length;

  return (
    <div className={cn('study-shell', 'study-shell--summary', completed && 'is-complete')}>
      {completed && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                background: piece.color,
                width: piece.size,
                height: piece.size,
              }}
            />
          ))}
        </div>
      )}

      <div className="summary-wrap">
        <div className="summary-hero">
          <div className="summary-mascot">
            <Mascot size={180} />
          </div>
          <p className="eyebrow">{completed ? 'ALL CLEAR' : 'ROUND COMPLETE'}</p>
          <h1>{completed ? '全部通关啦！' : `第 ${round.number} 轮完成`}</h1>
          <p className="summary-hero__sub">
            {completed
              ? `「${libraryName}」里的单词，这一遍都被你好好接住了。`
              : `这一轮的错词已经收好，再和它们见一面就会更熟悉。`}
          </p>
        </div>

        <div className="summary-card">
          <div className="summary-stats">
            <div className="summary-stat">
              <span>本轮单词</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="summary-stat summary-stat--mint">
              <span>认识</span>
              <strong>{stats.known}</strong>
            </div>
            <div className="summary-stat summary-stat--peach">
              <span>不认识</span>
              <strong>{stats.unknown}</strong>
            </div>
            <div className="summary-stat">
              <span>正确率</span>
              <strong>{stats.accuracy}%</strong>
            </div>
            <div className="summary-stat">
              <span>待复习</span>
              <strong>{unknownCount}</strong>
            </div>
            <div className="summary-stat">
              <span>本轮耗时</span>
              <strong className="summary-stat__time">{formatDuration(stats.durationMs)}</strong>
            </div>
          </div>

          <div className="round-path">
            {rounds.map((item) => {
              const itemStats = getRoundStats(item);
              return (
                <div className="round-path__item" key={item.number}>
                  <span className="round-path__dot" />
                  <small>第 {item.number} 轮</small>
                  <strong>{itemStats.total}</strong>
                  <em>{itemStats.accuracy}%</em>
                </div>
              );
            })}
          </div>

          <div className="summary-actions">
            {!completed && unknownCount > 0 ? (
              <>
                <button
                  type="button"
                  className="button button--primary button--lg"
                  onClick={onContinue}
                  disabled={busy}
                >
                  {busy ? (
                    '正在准备错词…'
                  ) : (
                    <>
                      继续复习 {unknownCount} 个错词 <ArrowRight size={17} />
                    </>
                  )}
                </button>
                <button type="button" className="button button--ghost" onClick={onHome} disabled={busy}>
                  稍后再继续
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button button--primary button--lg" onClick={onHome}>
                  <Home size={17} /> 回到首页
                </button>
                <button type="button" className="button button--ghost" onClick={onStats}>
                  查看学习足迹
                </button>
              </>
            )}
          </div>
          <p className="summary-save-note">
            <CircleCheck size={14} /> 本轮记录已经自动保存
          </p>
        </div>

        {!completed && (
          <p className="summary-quiet">
            <Sparkles size={14} /> 离开也没关系，下次可以从这里继续
          </p>
        )}
      </div>
    </div>
  );
}
