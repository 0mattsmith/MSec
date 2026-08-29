import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, Check, ScanLine, AlertTriangle } from 'lucide-react';
import { parseQrPayload, type ImportedTotp } from '../lib/otpimport';

/*
 * Reads authenticator QR codes, either from the camera or from a saved
 * image/screenshot. Decoding happens entirely on-device: the camera stream is
 * never recorded and no image leaves the browser.
 *
 * Prefers the native BarcodeDetector where available (Chrome, Android) and
 * falls back to the jsQR library elsewhere (Firefox, Safari).
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

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<ImportedTotp[]>([]);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stopCamera, []);

  const handlePayload = (payload: string): boolean => {
    const codes = parseQrPayload(payload);
    if (codes.length === 0) return false;
    setFound((prev) => {
      // Don't add the same secret twice if the camera sees it repeatedly.
      const seen = new Set(prev.map((c) => c.secret));
      return [...prev, ...codes.filter((c) => !seen.has(c.secret))];
    });
    return true;
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

      const tick = async () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const payload = await decodeImageData(data);
          if (payload && handlePayload(payload)) {
            stopCamera();
            return;
          }
        }
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      };
      void tick();
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was denied. You can upload a screenshot of the QR code instead.'
          : 'No camera is available. Upload a screenshot of the QR code instead.',
      );
      setScanning(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const payload = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (!payload) {
        setError('No QR code was found in that image. Try a sharper or larger screenshot.');
        return;
      }
      if (!handlePayload(payload)) {
        setError('That QR code is not an authenticator code.');
      }
    } catch {
      setError('That image could not be read.');
    }
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
          Scan a 2FA QR code, or upload a screenshot of one. Google Authenticator's
          "Export accounts" QR imports every account at once.
        </p>

        {scanning ? (
          <div className="relative mb-4 overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
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
              <Camera className="mr-2 h-4 w-4" /> Scan with camera
            </button>
            <label className="flex cursor-pointer items-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <ImageIcon className="mr-2 h-4 w-4" /> Upload image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {error && (
          <p className="mb-4 flex items-start rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mr-2 h-4 w-4 flex-shrink-0" />{error}
          </p>
        )}

        {found.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-bold text-gray-900 dark:text-white">
              Found {found.length} code{found.length === 1 ? '' : 's'}
            </p>
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {found.map((c, i) => (
                <li key={`${c.secret}-${i}`} className="flex items-center rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                  <Check className="mr-2 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{c.title}</p>
                    {c.username && <p className="truncate text-xs text-gray-500 dark:text-slate-400">{c.username}</p>}
                  </div>
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
