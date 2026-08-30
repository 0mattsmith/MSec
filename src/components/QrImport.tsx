import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, Check, ScanLine, AlertTriangle, Trash2 } from 'lucide-react';
import { parseQrPayload, type ImportedTotp } from '../lib/otpimport';

/*
 * Reads authenticator QR codes from the camera or from saved images.
 *
 * Exports are routinely split across several QR codes (Google Authenticator
 * does this once you have more than a handful of accounts), so this collects
 * codes across as many scans and files as you like and only commits them when
 * you say so. The camera keeps running after each hit — you just hold up the
 * next code.
 *
 * Decoding is entirely on-device: the camera stream is never recorded and no
 * image leaves the browser.
 */

interface Props {
  onImport: (codes: ImportedTotp[]) => void;
  onClose: () => void;
}

async function decodeImageData(data: ImageData): Promise<string | null> {
  const AnyWindow = window as any;
  if (AnyWindow.BarcodeDetector) {
    try {
      const detector = new AnyWindow.BarcodeDetector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(
        new ImageData(new Uint8ClampedArray(data.data), data.width, data.height),
      );
      const found = await detector.detect(bitmap);
      if (found?.length) return found[0].rawValue as string;
    } catch {
      /* fall through to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const result = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
  return result?.data ?? null;
}

export function QrImport({ onImport, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  // Kept in a ref as well so the scan loop can dedupe without stale state.
  const seenRef = useRef<Set<string>>(new Set());

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<ImportedTotp[]>([]);
  const [flash, setFlash] = useState('');
  const [duplicates, setDuplicates] = useState(0);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stopCamera, []);

  /** Returns how many *new* codes the payload contributed. */
  const handlePayload = (payload: string): number => {
    const codes = parseQrPayload(payload);
    if (codes.length === 0) return 0;

    const fresh = codes.filter((c) => !seenRef.current.has(c.secret));
    const dupes = codes.length - fresh.length;
    if (dupes > 0) setDuplicates((d) => d + dupes);
    if (fresh.length === 0) return 0;

    fresh.forEach((c) => seenRef.current.add(c.secret));
    setFound((prev) => [...prev, ...fresh]);
    setFlash(`Added ${fresh.length} code${fresh.length === 1 ? '' : 's'}${dupes ? ` (${dupes} already scanned)` : ''}`);
    setTimeout(() => setFlash(''), 2500);
    return fresh.length;
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      let cooldownUntil = 0;

      const tick = async () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA && Date.now() > cooldownUntil) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const payload = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (payload) {
            const added = handlePayload(payload);
            // Brief pause so the same code isn't re-read dozens of times a
            // second while you move on to the next one.
            cooldownUntil = Date.now() + (added > 0 ? 1200 : 600);
          }
        }
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      };
      void tick();
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. You can upload screenshots of the QR codes instead.'
          : 'No camera is available. Upload screenshots of the QR codes instead.',
      );
      setScanning(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    setError('');
    if (!files || files.length === 0) return;

    let added = 0;
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        const payload = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (!payload) { failures.push(`${file.name}: no QR code found`); continue; }
        const n = handlePayload(payload);
        if (n === 0 && parseQrPayload(payload).length === 0) {
          failures.push(`${file.name}: not an authenticator code`);
        }
        added += n;
      } catch {
        failures.push(`${file.name}: could not be read`);
      }
    }

    if (failures.length > 0) {
      setError(`${failures.length} of ${files.length} image${files.length === 1 ? '' : 's'} could not be used — ${failures.slice(0, 3).join('; ')}`);
    }
  };

  const removeCode = (secret: string) => {
    seenRef.current.delete(secret);
    setFound((prev) => prev.filter((c) => c.secret !== secret));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm safe-all">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#1A1F26]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center text-lg font-bold text-gray-900 dark:text-white">
            <ScanLine className="mr-2 h-5 w-5 text-indigo-500" /> Import authenticator codes
          </h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">
          Scan as many QR codes as you need — exports are often split across several.
          Codes collect below and nothing is saved until you tap Add. You can also
          select multiple screenshots at once.
        </p>

        {scanning ? (
          <div className="relative mb-4 overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
            <div className="absolute inset-x-0 top-0 bg-black/60 p-2 text-center text-xs font-medium text-white">
              {flash || 'Point at a QR code — keep going for multi-part exports'}
            </div>
            <button
              onClick={stopCamera}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-4 py-2 text-xs font-bold text-gray-900"
            >
              Stop camera
            </button>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              onClick={startCamera}
              className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              <Camera className="mr-2 h-4 w-4" /> {found.length ? 'Scan another' : 'Scan with camera'}
            </button>
            <label className="flex cursor-pointer items-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <ImageIcon className="mr-2 h-4 w-4" /> Upload images
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = ''; // let the same file be picked again
                }}
              />
            </label>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {!scanning && flash && (
          <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            {flash}
          </p>
        )}

        {error && (
          <p className="mb-4 flex items-start rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />{error}
          </p>
        )}

        {found.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {found.length} code{found.length === 1 ? '' : 's'} ready
              </p>
              {duplicates > 0 && (
                <span className="text-xs text-gray-500 dark:text-slate-400">{duplicates} duplicate{duplicates === 1 ? '' : 's'} ignored</span>
              )}
            </div>
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {found.map((c) => (
                <li key={c.secret} className="flex items-center rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                  <Check className="mr-2 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{c.title}</p>
                    {c.username && <p className="truncate text-xs text-gray-500 dark:text-slate-400">{c.username}</p>}
                  </div>
                  <button
                    onClick={() => removeCode(c.secret)}
                    aria-label={`Remove ${c.title}`}
                    className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { stopCamera(); onImport(found); }}
            disabled={found.length === 0}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Add {found.length || ''} to vault
          </button>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
