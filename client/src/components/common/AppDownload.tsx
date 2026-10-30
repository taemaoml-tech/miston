import { Smartphone } from 'lucide-react';
import { isAndroid } from '../../utils/platform';

/** Реліз із фіксованим іменем файла: `latest` означає «найсвіжіша збірка» без правки сайту. */
export const APK_DOWNLOAD_URL = 'https://github.com/taemaoml-tech/miston/releases/latest/download/Miston-android.apk';

export function AppDownload() {
  const onAndroid = isAndroid();
  return (
    <div className="mt-5 border-t pt-5 dark:border-slate-800">
      <a href={APK_DOWNLOAD_URL} download className="secondary-btn w-full">
        <Smartphone size={17} /> Завантажити застосунок для Android
      </a>
      <p className="mt-2 text-center text-xs leading-5 text-slate-400 dark:text-slate-500">
        {onAndroid
          ? 'Файл .apk: Android запитає дозвіл на встановлення з невідомих джерел.'
          : 'Версій для iOS, Windows чи macOS поки немає — файл призначений для телефона з Android.'}
      </p>
    </div>
  );
}
