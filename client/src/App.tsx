import { AuthPage } from './components/auth/AuthPage';
import { Splash } from './components/common/Splash';
import { InfoRouter } from './components/info/InfoRouter';
import { MessengerApp } from './components/layout/MessengerApp';
import { useAuth } from './contexts/AuthContext';
import { useInfoRoute } from './router/infoRoute';

export default function App() {
  const { user, loading } = useAuth();
  const route = useInfoRoute();

  if (loading) return <main className="h-full"><Splash hint="Відновлюємо сесію…" /></main>;

  if (!user) return route ? <InfoRouter route={route} variant="public" /> : <AuthPage />;

  // Месенджер лишається змонтованим під інфосторінкою, щоб повернення до чатів було миттєвим.
  return (
    <>
      <MessengerApp />
      {route && <InfoRouter route={route} variant="overlay" />}
    </>
  );
}
