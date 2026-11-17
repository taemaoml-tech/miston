import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

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
            <App />
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
