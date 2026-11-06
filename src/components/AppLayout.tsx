import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, BookHeart, Home } from 'lucide-react';
import { TinyMascot } from './Mascot';
import { cn } from '../lib/utils';
import { APP_VERSION_LABEL } from '../lib/version';

const NAV_ITEMS = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/libraries', label: '我的词库', icon: BookHeart, end: false },
  { to: '/stats', label: '学习统计', icon: BarChart3, end: false },
];

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  return null;
}

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <ScrollToTop />
      <div className="app-decor" aria-hidden="true">
        <span className="app-decor__blob app-decor__blob--one" />
        <span className="app-decor__blob app-decor__blob--two" />
        <span className="app-decor__blob app-decor__blob--three" />
      </div>

      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to="/" className="brand" aria-label="丘丘背单词首页">
            <span className="brand__mascot">
              <TinyMascot size={40} />
            </span>
            <span className="brand__text">
              <strong>丘丘背单词</strong>
              <small>把单词慢慢抱回家</small>
            </span>
          </NavLink>

          <nav className="nav-tabs" aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('nav-tab', isActive && 'is-active')}
                >
                  <Icon size={16} strokeWidth={2.2} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="topbar__note">
            <span className="topbar__note-dot" />
            数据只留在你的电脑里
          </div>
        </div>
      </header>

      <main className={cn('page', `page--${location.pathname === '/' ? 'home' : 'inner'}`)}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>丘丘背单词</span>
        <span className="site-footer__dot">·</span>
        <span>离线，私密，属于你一个人的小小词库</span>
        <span className="site-footer__dot">·</span>
        <span className="site-footer__version" title={`当前版本 ${APP_VERSION_LABEL}`}>
          {APP_VERSION_LABEL}
        </span>
      </footer>

      <nav className="mobile-nav" aria-label="移动端导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('mobile-nav__item', isActive && 'is-active')}
            >
              <Icon size={20} strokeWidth={2.1} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
