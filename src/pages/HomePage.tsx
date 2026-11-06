import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookHeart,
  BookOpenCheck,
  CircleCheck,
  Play,
  Plus,
  Sparkles,
  Sprout,
  WifiOff,
} from 'lucide-react';
import { db } from '../db/db';
import { getActiveSessionsWithLibraries, getLibrariesWithCounts } from '../db/repositories';
import type { Library } from '../types';
import { getGreeting, getSessionProgress, formatShortDate } from '../lib/utils';
import { Mascot } from '../components/Mascot';
import { LibraryFormModal } from '../components/LibraryFormModal';
import { StartLearningDialog } from '../components/StartLearningDialog';
import { useToast } from '../components/ToastProvider';
import { PageLoader } from '../components/UI';

const WELCOME_QUOTES = [
  '背单词的丘丘最帅了！！',
  '单词归你，梦膨胀也归你。',
  '丘丘负责记单词，梦膨胀负责记丘丘。',
  '错几次也没关系，梦膨胀会陪你再走一遍。',
  '背对一个，梦膨胀奖励一个抱抱，先欠着。',
];

export function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [startOpen, setStartOpen] = useState(false);
  const [libraryFormOpen, setLibraryFormOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const [libraries, activeSessions, completedSessionCount] = await Promise.all([
      getLibrariesWithCounts(),
      getActiveSessionsWithLibraries(),
      db.sessions.where('status').equals('completed').count(),
    ]);
    return {
      libraries,
      activeSessions: activeSessions.filter((item) => item.library),
      completedSessionCount,
    };
  }, [], undefined);

  const quote = WELCOME_QUOTES[Math.floor(Date.now() / 86_400_000) % WELCOME_QUOTES.length];
  const greeting = getGreeting();

  const handleLibrarySaved = (library: Library) => {
    setLibraryFormOpen(false);
    toast('词库创建好啦，接下来放些单词进去吧');
    navigate(`/libraries/${library.id}`);
  };

  if (data === undefined) {
    return (
      <div className="home-page">
        <PageLoader />
      </div>
    );
  }

  const totalWords = data.libraries.reduce((sum, library) => sum + library.wordCount, 0);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">
            <span className="eyebrow__line" />
            欢迎回来
          </p>
          <h1>
            {greeting}，丘丘<br />
            和单词<span className="marker">慢慢变熟</span>。
          </h1>
          <p className="hero__quote">{quote}</p>

          <div className="hero__actions">
            <button
              type="button"
              className="button button--primary button--lg"
              onClick={() => setStartOpen(true)}
            >
              <Play size={18} fill="currentColor" strokeWidth={0} />
              选择词库开始学习
            </button>
            <button
              type="button"
              className="button button--soft button--lg"
              onClick={() => setLibraryFormOpen(true)}
            >
              <Plus size={18} />
              创建词库
            </button>
            <button
              type="button"
              className="text-button text-button--hero"
              onClick={() => navigate('/libraries')}
            >
              进入词库管理 <ArrowRight size={15} />
            </button>
          </div>

          <div className="hero__stats">
            <div className="hero-stat">
              <strong>{data.libraries.length}</strong>
              <span>个小词库</span>
            </div>
            <div className="hero-stat">
              <strong>{totalWords}</strong>
              <span>个单词</span>
            </div>
            <div className="hero-stat">
              <strong>{data.completedSessionCount}</strong>
              <span>次完成学习</span>
            </div>
          </div>
        </div>

        <div className="hero__art">
          <div className="hero__art-blob" aria-hidden="true" />
          <div className="hero-badge hero-badge--top">
            <Sprout size={15} /> 按自己的节奏
          </div>
          <Mascot size={280} className="hero__mascot" />
          <div className="hero-badge hero-badge--bottom">
            <Sparkles size={15} /> 错词会再见面
          </div>
          <span className="hero__dot hero__dot--one" aria-hidden="true" />
          <span className="hero__dot hero__dot--two" aria-hidden="true" />
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">IN PROGRESS</p>
            <h2>正在进行的学习</h2>
          </div>
          {data.activeSessions.length > 0 && (
            <span className="section-count">{data.activeSessions.length} 个会话</span>
          )}
        </div>

        {data.activeSessions.length === 0 ? (
          <div className="idle-card">
            <div className="idle-card__icon">
              <WifiOff size={20} />
            </div>
            <div>
              <h3>现在没有进行中的学习</h3>
              <p>随时挑一个词库开始。关掉浏览器也不怕，进度会自动保存在这台电脑里。</p>
            </div>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => setStartOpen(true)}
            >
              去学习 <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="active-session-list">
            {data.activeSessions.map(({ session, library }) => {
              const progress = getSessionProgress(session);
              const percent = progress.total > 0 ? (progress.answered / progress.total) * 100 : 0;
              return (
                <article className="active-session-card" key={session.id}>
                  <div className="active-session-card__top">
                    <span className="active-session-card__icon">
                      <BookOpenCheck size={20} />
                    </span>
                    <div className="active-session-card__title">
                      <h3>{session.libraryName}</h3>
                      <p>
                        第 {progress.round.number} 轮 · 本轮 {progress.answered} / {progress.total}
                      </p>
                    </div>
                    <span className="mini-badge mini-badge--butter">进行中</span>
                  </div>
                  <div className="progress-track progress-track--slim">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="active-session-card__bottom">
                    <span>
                      <CircleCheck size={14} /> 已判断 {progress.answered} 个
                      {library ? ` · 最近 ${formatShortDate(session.updatedAt)}` : ''}
                    </span>
                    <button
                      type="button"
                      className="button button--primary button--sm"
                      onClick={() => navigate(`/study/${session.id}`)}
                    >
                      继续学习 <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="home-lower-grid">
        <div className="soft-panel soft-panel--mint">
          <span className="soft-panel__icon">
            <BookHeart size={20} />
          </span>
          <div>
            <h3>词库由你定义</h3>
            <p>没有内置词表。把正在读的书、追的剧、工作里的词，做成只属于你的词库。</p>
          </div>
          <button type="button" className="text-button" onClick={() => navigate('/libraries')}>
            看看我的词库 <ArrowRight size={14} />
          </button>
        </div>
        <div className="soft-panel soft-panel--peach">
          <span className="soft-panel__icon">
            <CircleCheck size={20} />
          </span>
          <div>
            <h3>错词会留下来</h3>
            <p>不认识也没关系。它们会自动进入下一轮，直到这一轮里再没有陌生的词。</p>
          </div>
          <button type="button" className="text-button" onClick={() => navigate('/stats')}>
            看看学习足迹 <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <LibraryFormModal
        open={libraryFormOpen}
        onClose={() => setLibraryFormOpen(false)}
        onSaved={handleLibrarySaved}
      />
      <StartLearningDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onStarted={(sessionId) => navigate(`/study/${sessionId}`)}
        onCreateLibrary={() => setLibraryFormOpen(true)}
      />
    </div>
  );
}
