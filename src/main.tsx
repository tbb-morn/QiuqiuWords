import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/quicksand';
import './styles/global.css';
import './styles/components.css';
import './styles/content.css';
import './styles/responsive.css';
import App from './App';

// 尽量让浏览器把这台电脑上的学习数据视为重要数据，减少被自动清理的可能。
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
