import { useEffect, useRef } from 'react';

/**
 * Native Android надсилає цю подію замість стандартного переходу назад.
 * WebView повертає `defaultPrevented` у Java, тому обробники мають викликати
 * event.preventDefault() (або цей хелпер зробить це за них) тільки тоді,
 * коли справді обробили навігацію всередині застосунку.
 */
export const ANDROID_BACK_EVENT = 'miston:android-back';

type BackHandler = () => boolean;

interface BackEntry {
  handler: BackHandler;
  priority: number;
  order: number;
}

const handlers = new Set<BackEntry>();
let nextOrder = 0;
let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(ANDROID_BACK_EVENT, (event: Event) => {
    const ordered = [...handlers].sort((a, b) => b.priority - a.priority || a.order - b.order);
    for (const entry of ordered) {
      try {
        if (entry.handler()) {
          event.preventDefault();
          return;
        }
      } catch (error) {
        console.warn('[back] обробник не впорався', error);
      }
    }
  });
}

/** Чим більший priority, тим раніше обробник закриє свою панель/модалку. */
export function registerAndroidBackHandler(handler: BackHandler, priority = 0): () => void {
  install();
  const entry: BackEntry = { handler, priority, order: nextOrder++ };
  handlers.add(entry);
  return () => { handlers.delete(entry); };
}

/**
 * React-хук для back-навігації. Handler завжди бачить свіжий стан компонента,
 * а реєструється лише один раз — це уникає гонки ефектів у StrictMode.
 */
export function useAndroidBack(handler: BackHandler, priority = 0): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => registerAndroidBackHandler(() => handlerRef.current(), priority), [priority]);
}
