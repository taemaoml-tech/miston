import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

// На Android System WebView 153/154 скляні панелі з backdrop-filter можуть
// малюватися суцільною темною плямою. Тримаємо цей клас тільки для Android,
// щоб на iOS/windows залишався повний Apple-glass еfect.
if (/android/i.test(navigator.userAgent)) document.documentElement.classList.add('android');

// Нативний міст віддає реальні встави камери/статусбара: частина Android WebView
// не підтримує env(safe-area-inset-top) навіть з viewport-fit=cover.
const nativeSafeArea = (window as unknown as {
  MistonNative?: { top?: () => number; bottom?: () => number };
}).MistonNative;
if (nativeSafeArea) {
  if (typeof nativeSafeArea.top === 'function') {
    document.documentElement.style.setProperty('--miston-safe-top', `${nativeSafeArea.top()}px`);
  }
  if (typeof nativeSafeArea.bottom === 'function') {
    document.documentElement.style.setProperty('--miston-safe-bottom', `${nativeSafeArea.bottom()}px`);
  }
}

function removeBootSplash() {
  const boot = document.getElementById('boot-splash');
  if (!boot) return;
  boot.style.transition = 'opacity 240ms ease';
  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 240);
}

// Запобіжник: якщо React не змонтувався (помилка в провайдері тощо),
// прибираємо стартовий екран через 6 с, щоб не лишати чорний/темний екран.
window.setTimeout(removeBootSplash, 6000);

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>,
  );
  removeBootSplash();
} catch (error) {
  console.error('Failed to mount React app', error);
  removeBootSplash();
}
