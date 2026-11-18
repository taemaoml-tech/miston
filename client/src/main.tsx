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
// Міст додається з Java в onResume/onWindowFocusChanged, тому на холодному
// старті його може ще не бути — перечитуємо його на focus/resize.
function syncNativeSafeArea() {
  const nativeSafeArea = (window as unknown as {
    MistonNative?: { top?: () => number; bottom?: () => number };
  }).MistonNative;
  if (!nativeSafeArea) return;
  if (typeof nativeSafeArea.top === 'function') {
    document.documentElement.style.setProperty('--miston-safe-top', `${nativeSafeArea.top()}px`);
  }
  if (typeof nativeSafeArea.bottom === 'function') {
    document.documentElement.style.setProperty('--miston-safe-bottom', `${nativeSafeArea.bottom()}px`);
  }
}
syncNativeSafeArea();
window.addEventListener('focus', syncNativeSafeArea);
window.addEventListener('focusin', syncNativeSafeArea);
window.addEventListener('resize', syncNativeSafeArea);

// Коли Android відкриває клавіатуру, layout viewport лишається повним, а
// видимий — меншим. Без цього поля входу опиняються під клавіатурою й
// залишається порожня область угорі.
let visualFrame = 0;
let lastVisualHeight = -1;
let lastVisualTop = -1;
function syncVisualViewport() {
  // resize/scroll можуть приходити пачкою; без rAF і перевірки на повтор
  // зміна CSS-змінних здатна викликати новий resize і закільцюватися.
  if (visualFrame) window.cancelAnimationFrame(visualFrame);
  visualFrame = window.requestAnimationFrame(() => {
    visualFrame = 0;
    const visual = window.visualViewport;
    const height = visual?.height && visual.height > 0 ? visual.height : window.innerHeight;
    const top = visual?.offsetTop ?? 0;
    if (height !== lastVisualHeight) {
      lastVisualHeight = height;
      document.documentElement.style.setProperty('--miston-visual-height', `${height}px`);
    }
    if (top !== lastVisualTop) {
      lastVisualTop = top;
      document.documentElement.style.setProperty('--miston-visual-top', `${top}px`);
    }
  });
}
syncVisualViewport();
window.visualViewport?.addEventListener('resize', syncVisualViewport);
window.visualViewport?.addEventListener('scroll', syncVisualViewport);
window.addEventListener('resize', syncVisualViewport);

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
  // render() асинхронний: чекаємо два кадри, щоб не лишити порожній екран
  // між зникненням splash і першим малюнком React на віддаленому WebView.
  window.requestAnimationFrame(() => window.requestAnimationFrame(removeBootSplash));
} catch (error) {
  console.error('Failed to mount React app', error);
  removeBootSplash();
}
