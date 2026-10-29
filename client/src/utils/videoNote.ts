export const VIDEO_NOTE_MAX_SECONDS = 60;
export const VIDEO_NOTE_COMPRESS_THRESHOLD = 2.5 * 1024 * 1024;

const MIME_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/webm;codecs=vp9,opus',
  'video/mp4',
];

export function pickVideoNoteMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function videoNoteExtension(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

// Busboy's content-type parser rejects multi-codec parameters such as
// "video/webm;codecs=vp9,opus" and falls back to text/plain. Uploads therefore
// must use the bare media type; playback sniffs the actual container anyway.
export function videoNoteBaseMime(type: string): string {
  const base = type.split(';', 1)[0]!.trim().toLowerCase();
  return base.startsWith('video/') ? base : 'video/webm';
}

export function videoNoteErrorMessage(error: unknown): string {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Браузер не підтримує запис відео. Потрібен HTTPS або localhost.';
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Доступ до камери й мікрофона заборонено. Дозвольте його в налаштуваннях браузера.';
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'Не знайдено камеру або мікрофон.';
    }
    if (error.name === 'NotReadableError') {
      return 'Камера або мікрофон зайняті іншим застосунком.';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Не вдалося записати відеокружечок. Спробуйте ще раз.';
}

export function needsVideoNoteCompression(blob: Blob): boolean {
  return blob.size > VIDEO_NOTE_COMPRESS_THRESHOLD;
}

interface CompressOptions {
  durationSeconds: number;
  onProgress?: (progress: number) => void;
}

// Re-encodes a recorded note into a 360×360 stream. The source audio is routed
// through Web Audio into the new stream, so the compressed note keeps its sound
// without playing it back through the speakers.
export async function compressVideoNote(source: Blob, { durationSeconds, onProgress }: CompressOptions): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') return source;
  const mimeType = pickVideoNoteMime();
  if (!mimeType) return source;

  const url = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';
  let audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let animation = 0;
  let timeout = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Не вдалося прочитати запис'));
    });
    const size = 360;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return source;

    const stream = canvas.captureStream(24);
    audioContext = new AudioContext();
    const audioSource = audioContext.createMediaElementSource(video);
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);
    const audioTrack = audioDestination.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);
    await audioContext.resume().catch(() => undefined);
    video.muted = false;

    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 420_000,
      audioBitsPerSecond: 48_000,
    });
    const finished = new Promise<Blob>((resolve) => {
      recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }));
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start(250);

    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSeconds;
    const draw = () => {
      const side = Math.min(video.videoWidth || size, video.videoHeight || size);
      const sx = ((video.videoWidth || side) - side) / 2;
      const sy = ((video.videoHeight || side) - side) / 2;
      context.drawImage(video, sx, sy, side, side, 0, 0, size, size);
      if (total > 0) onProgress?.(Math.min(1, video.currentTime / total));
      if (!video.ended && !video.paused) {
        animation = requestAnimationFrame(draw);
      } else if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
    const stopAll = () => {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      window.clearTimeout(timeout);
      cancelAnimationFrame(animation);
    };
    video.onended = stopAll;
    timeout = window.setTimeout(stopAll, Math.max(5_000, durationSeconds * 1000 + 3_000));

    await video.play();
    animation = requestAnimationFrame(draw);

    const compressed = await finished;
    onProgress?.(1);
    if (!compressed.size || compressed.size >= source.size) return source;
    return compressed;
  } catch {
    return source;
  } finally {
    cancelAnimationFrame(animation);
    window.clearTimeout(timeout);
    video.onended = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    await audioContext?.close().catch(() => undefined);
    URL.revokeObjectURL(url);
  }
}
