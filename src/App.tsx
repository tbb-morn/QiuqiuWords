import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AppLayout } from './components/AppLayout';
import { ToastProvider } from './components/ToastProvider';
import { EmptyState } from './components/UI';
import { HomePage } from './pages/HomePage';
import { LibrariesPage } from './pages/LibrariesPage';
import { LibraryPage } from './pages/LibraryPage';
import { StatsPage } from './pages/StatsPage';
import { StudyPage } from './pages/StudyPage';

function NotFoundPage() {
  return (
    <div className="page-inner">
      <div className="panel">
        <EmptyState
          title="这条小路没有通向单词"
          description="页面可能已经移动，或者链接少了一点内容。"
          action={
            <Link to="/" className="button button--primary">
              <Compass size={16} /> 回到首页
            </Link>
          }
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="libraries" element={<LibrariesPage />} />
            <Route path="libraries/:libraryId" element={<LibraryPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="study/:sessionId" element={<StudyPage />} />
        </Routes>
      </ToastProvider>
    </HashRouter>
  );
}
