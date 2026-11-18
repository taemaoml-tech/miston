import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type LanguageCode = 'uk' | 'en' | 'pl' | 'de' | 'es';

export const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: 'uk', label: 'Українська' },
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
];

const LOCALES: Record<LanguageCode, string> = {
  uk: 'uk-UA', en: 'en-US', pl: 'pl-PL', de: 'de-DE', es: 'es-ES',
};

// Переклади для найважливіших рядків налаштувань. Інші рядки лишаються
// українськими через fallback, тому частковий переклад ніколи не показує ключі.
const MESSAGES: Partial<Record<LanguageCode, Record<string, string>>> = {
  en: {
    settings: 'Settings', account: 'Account', accountSub: 'Profile, Mist ID & security',
    appearance: 'Appearance', appearanceSub: 'Theme, avatar, name', chats: 'Chats',
    chatsSub: 'Messages & style', privacy: 'Privacy', privacySub: 'Blocking & security',
    notifications: 'Notifications', notificationsSub: 'Push, sounds & vibration',
    data: 'Data', dataSub: 'Cache & local data', folders: 'Chat folders',
    foldersSub: 'Sort chats into folders', devices: 'Devices', devicesSub: 'Active sessions',
    energy: 'Energy saving', energySub: 'Fewer animations on low battery',
    language: 'Language', languageSub: 'Interface language', bots: 'Bots',
    botsSub: 'Create & manage bots with BotFather', mistInbox: 'Mist ID',
    mistInboxSub: 'Sign-in requests', qrLogin: 'Sign in with QR',
    qrLoginSub: 'Sign in on another device',
    foldersIntro: 'Create folders and sort chats to find conversations faster.',
    folderName: 'Folder name', folderColor: 'Color', createFolder: 'Create folder',
    noFolders: 'No folders yet. Create the first one to sort your chats.',
    rename: 'Rename', delete: 'Delete', chatsCount: 'chats', allChats: 'All chats',
    uncategorized: 'Unsorted', assign: 'Add to folder', removeFromFolder: 'Remove from folder',
    saved: 'Saved', error: 'Error', cancel: 'Cancel',
    botsIntro: 'Create bots in the chat with BotFather or connect an existing bot with its token.',
    openBotFather: 'Open BotFather', botCommand: 'In the chat with BotFather write /newbot Name usernamebot to create a bot.',
    connectBot: 'Connect a bot', botToken: 'Bot token', tokenPlaceholder: 'Paste token from BotFather',
    connect: 'Connect', myBots: 'My bots', noBots: 'No bots yet. Create one with BotFather or connect with a token.',
    funMode: 'Fun mode', copyToken: 'Copy token',
    energyIntro: 'Energy saving turns off animations and glass effects to save battery.',
    energyHint: 'Animations and blur stay off until you turn this mode off.',
    energyEffect1: 'No transition animations', energyEffect2: 'No glass blur', energyEffect3: 'Less screen work',
    languageIntro: 'Choose the interface language. Untranslated messages remain Ukrainian.',
    interfaceLanguage: 'Miston interface language', enabled: 'On', disabled: 'Off',
  },
  pl: {
    settings: 'Ustawienia', account: 'Konto', accountSub: 'Profil, Mist ID i bezpieczeństwo',
    appearance: 'Wygląd', appearanceSub: 'Motyw, awatar, nazwa', chats: 'Czaty',
    chatsSub: 'Wiadomości i wygląd', privacy: 'Prywatność', privacySub: 'Blokowanie i bezpieczeństwo',
    notifications: 'Powiadomienia', notificationsSub: 'Push, dźwięki i wibracje',
    data: 'Dane', dataSub: 'Pamięć podręczna i dane', folders: 'Foldery czatów',
    foldersSub: 'Sortuj czaty do folderów', devices: 'Urządzenia', devicesSub: 'Aktywne sesje',
    energy: 'Oszczędzanie energii', energySub: 'Mniej animacji przy niskim poziomie baterii',
    language: 'Język', languageSub: 'Język interfejsu', bots: 'Boty',
    botsSub: 'Twórz i zarządzaj botami przez BotFather', mistInbox: 'Mist ID',
    mistInboxSub: 'Żądania logowania', qrLogin: 'Logowanie przez QR',
    qrLoginSub: 'Zaloguj się na innym urządzeniu',
    foldersIntro: 'Twórz foldery i sortuj czaty, aby szybciej znajdować rozmowy.',
    folderName: 'Nazwa folderu', folderColor: 'Kolor', createFolder: 'Utwórz folder',
    noFolders: 'Jeszcze nie ma folderów. Utwórz pierwszy, aby posegregować czaty.',
    rename: 'Zmień nazwę', delete: 'Usuń', chatsCount: 'czatów', allChats: 'Wszystkie czaty',
    uncategorized: 'Nieposegregowane', assign: 'Dodaj do folderu', removeFromFolder: 'Usuń z folderu',
    saved: 'Zapisano', error: 'Błąd', cancel: 'Anuluj',
    botsIntro: 'Twórz boty w czacie z BotFather lub podłącz istniejącego bota tokenem.',
    openBotFather: 'Otwórz BotFather', botCommand: 'W czacie z BotFather wpisz /newbot Nazwa usernamebot, aby utworzyć bota.',
    connectBot: 'Podłącz bota', botToken: 'Token bota', tokenPlaceholder: 'Wklej token od BotFather',
    connect: 'Połącz', myBots: 'Moje boty', noBots: 'Jeszcze nie masz botów. Utwórz bota przez BotFather lub podłącz tokenem.',
    funMode: 'Tryb żartów', copyToken: 'Kopiuj token',
    energyIntro: 'Oszczędzanie energii wyłącza animacje i efekty szkła, aby oszczędzać baterię.',
    energyHint: 'Animacje i rozmycie pozostaną wyłączone do czasu wyłączenia tego trybu.',
    energyEffect1: 'Brak animacji przejść', energyEffect2: 'Brak rozmycia szkła', energyEffect3: 'Mniej pracy ekranu',
    languageIntro: 'Wybierz język interfejsu. Nieprzetłumaczone wiadomości pozostają ukraińskie.',
    interfaceLanguage: 'Język interfejsu Miston', enabled: 'Włączone', disabled: 'Wyłączone',
  },
  de: {
    settings: 'Einstellungen', account: 'Konto', accountSub: 'Profil, Mist ID & Sicherheit',
    appearance: 'Darstellung', appearanceSub: 'Design, Avatar, Name', chats: 'Chats',
    chatsSub: 'Nachrichten & Stil', privacy: 'Datenschutz', privacySub: 'Blockieren & Sicherheit',
    notifications: 'Benachrichtigungen', notificationsSub: 'Push, Töne & Vibration',
    data: 'Daten', dataSub: 'Cache & lokale Daten', folders: 'Chat-Ordner',
    foldersSub: 'Chats in Ordnern sortieren', devices: 'Geräte', devicesSub: 'Aktive Sitzungen',
    energy: 'Energiesparen', energySub: 'Weniger Animationen bei niedrigem Akku',
    language: 'Sprache', languageSub: 'Sprache der Oberfläche', bots: 'Bots',
    botsSub: 'Bots mit BotFather erstellen und verwalten', mistInbox: 'Mist ID',
    mistInboxSub: 'Anmeldeanfragen', qrLogin: 'Mit QR anmelden',
    qrLoginSub: 'Auf einem anderen Gerät anmelden',
    foldersIntro: 'Erstelle Ordner und sortiere Chats, um Gespräche schneller zu finden.',
    folderName: 'Ordnername', folderColor: 'Farbe', createFolder: 'Ordner erstellen',
    noFolders: 'Noch keine Ordner. Erstelle den ersten, um deine Chats zu sortieren.',
    rename: 'Umbenennen', delete: 'Löschen', chatsCount: 'Chats', allChats: 'Alle Chats',
    uncategorized: 'Unsortiert', assign: 'Zu Ordner hinzufügen', removeFromFolder: 'Aus Ordner entfernen',
    saved: 'Gespeichert', error: 'Fehler', cancel: 'Abbrechen',
    botsIntro: 'Erstelle Bots im Chat mit BotFather oder verbinde einen vorhandenen Bot mit seinem Token.',
    openBotFather: 'BotFather öffnen', botCommand: 'Schreibe im Chat mit BotFather /newbot Name usernamebot, um einen Bot zu erstellen.',
    connectBot: 'Bot verbinden', botToken: 'Bot-Token', tokenPlaceholder: 'Token von BotFather einfügen',
    connect: 'Verbinden', myBots: 'Meine Bots', noBots: 'Noch keine Bots. Erstelle einen mit BotFather oder verbinde ihn per Token.',
    funMode: 'Spaßmodus', copyToken: 'Token kopieren',
    energyIntro: 'Energiesparen deaktiviert Animationen und Glaseffekte, um Akku zu sparen.',
    energyHint: 'Animationen und Weichzeichnung bleiben aus, bis du diesen Modus deaktivierst.',
    energyEffect1: 'Keine Übergangsanimationen', energyEffect2: 'Kein Glas-Weichzeichnen', energyEffect3: 'Weniger Bildschirmarbeit',
    languageIntro: 'Wähle die Sprache der Oberfläche. Nicht übersetzte Meldungen bleiben Ukrainisch.',
    interfaceLanguage: 'Miston-Oberflächensprache', enabled: 'An', disabled: 'Aus',
  },
  es: {
    settings: 'Ajustes', account: 'Cuenta', accountSub: 'Perfil, Mist ID y seguridad',
    appearance: 'Apariencia', appearanceSub: 'Tema, avatar, nombre', chats: 'Chats',
    chatsSub: 'Mensajes y estilo', privacy: 'Privacidad', privacySub: 'Bloqueo y seguridad',
    notifications: 'Notificaciones', notificationsSub: 'Push, sonidos y vibración',
    data: 'Datos', dataSub: 'Caché y datos locales', folders: 'Carpetas de chat',
    foldersSub: 'Ordena los chats en carpetas', devices: 'Dispositivos', devicesSub: 'Sesiones activas',
    energy: 'Ahorro de energía', energySub: 'Menos animaciones con batería baja',
    language: 'Idioma', languageSub: 'Idioma de la interfaz', bots: 'Bots',
    botsSub: 'Crea y gestiona bots con BotFather', mistInbox: 'Mist ID',
    mistInboxSub: 'Solicitudes de acceso', qrLogin: 'Iniciar sesión con QR',
    qrLoginSub: 'Inicia sesión en otro dispositivo',
    foldersIntro: 'Crea carpetas y ordena los chats para encontrar conversaciones más rápido.',
    folderName: 'Nombre de la carpeta', folderColor: 'Color', createFolder: 'Crear carpeta',
    noFolders: 'Aún no hay carpetas. Crea la primera para ordenar tus chats.',
    rename: 'Renombrar', delete: 'Eliminar', chatsCount: 'chats', allChats: 'Todos los chats',
    uncategorized: 'Sin clasificar', assign: 'Añadir a carpeta', removeFromFolder: 'Quitar de la carpeta',
    saved: 'Guardado', error: 'Error', cancel: 'Cancelar',
    botsIntro: 'Crea bots en el chat con BotFather o conecta un bot existente con su token.',
    openBotFather: 'Abrir BotFather', botCommand: 'En el chat con BotFather escribe /newbot Nombre usernamebot para crear un bot.',
    connectBot: 'Conectar un bot', botToken: 'Token del bot', tokenPlaceholder: 'Pega el token de BotFather',
    connect: 'Conectar', myBots: 'Mis bots', noBots: 'Aún no tienes bots. Crea uno con BotFather o conéctalo con un token.',
    funMode: 'Modo diversión', copyToken: 'Copiar token',
    energyIntro: 'El ahorro de energía desactiva animaciones y efectos de cristal para ahorrar batería.',
    energyHint: 'Las animaciones y el desenfoque siguen desactivados hasta que desactives este modo.',
    energyEffect1: 'Sin animaciones de transición', energyEffect2: 'Sin desenfoque de cristal', energyEffect3: 'Menos trabajo de pantalla',
    languageIntro: 'Elige el idioma de la interfaz. Los mensajes sin traducir siguen en ucraniano.',
    interfaceLanguage: 'Idioma de la interfaz de Miston', enabled: 'Activado', disabled: 'Desactivado',
  },
};

interface LanguageContextValue {
  language: LanguageCode;
  locale: string;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, ukrainian: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'uk', locale: LOCALES.uk, setLanguage: () => undefined, t: (_key, ukrainian) => ukrainian,
});

function readSavedLanguage(): LanguageCode {
  const saved = localStorage.getItem('relay.language');
  if (saved && LANGUAGES.some((item) => item.code === saved)) return saved as LanguageCode;
  const browser = navigator.language.slice(0, 2).toLowerCase();
  if (LANGUAGES.some((item) => item.code === browser)) return browser as LanguageCode;
  return 'uk';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readSavedLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('relay.language', language);
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => setLanguageState(code), []);
  const t = useCallback((key: string, ukrainian: string) => MESSAGES[language]?.[key] ?? ukrainian, [language]);
  const value = useMemo(() => ({ language, locale: LOCALES[language], setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
