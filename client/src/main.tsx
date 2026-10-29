import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

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

// Стартовий екран з index.html прибираємо лише після першого рендера React.
const boot = document.getElementById('boot-splash');
if (boot) {
  boot.style.transition = 'opacity 240ms ease';
  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 240);
}
