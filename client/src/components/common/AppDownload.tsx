import { Monitor, Smartphone } from 'lucide-react';
import { isAndroid } from '../../utils/platform';

/** Реліз із фіксованим іменем файла: `latest` означає «найсвіжіша збірка» без правки сайту. */
export const APK_DOWNLOAD_URL = 'https://github.com/taemaoml-tech/miston/releases/latest/download/Miston-android.apk';
export const WINDOWS_DOWNLOAD_URL = 'https://github.com/taemaoml-tech/miston/releases/latest/download/Miston-windows.exe';

export function AppDownload() {
  const onAndroid = isAndroid();
  return (
    <div className="mt-5 border-t pt-5 dark:border-slate-800">
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={APK_DOWNLOAD_URL} download className="secondary-btn w-full">
          <Smartphone size={17} /> Завантажити для Android
        </a>
        <a href={WINDOWS_DOWNLOAD_URL} download className="secondary-btn w-full">
          <Monitor size={17} /> Завантажити для Windows
        </a>
      </div>
      <p className="mt-2 text-center text-xs leading-5 text-slate-400 dark:text-slate-500">
        {onAndroid
          ? 'Файл .apk: Android запитає дозвіл на встановлення з невідомих джерел.'
          : 'Android — файл .apk, Windows — портативний .exe, який запускається без встановлення.'}
      </p>
    </div>
  );
}
