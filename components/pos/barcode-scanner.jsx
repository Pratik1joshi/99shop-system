'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Camera barcode scanner. USB scanners need no component — they type into the
 * POS search box like a keyboard — so this covers phones/tablets only.
 */
export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const controlsRef = useRef(null);
  const hasDetectedRef = useRef(false);
  // Held in a ref so inline parent callbacks don't restart the camera on every render.
  const handlersRef = useRef({ onDetected, onClose });
  useEffect(() => {
    handlersRef.current = { onDetected, onClose };
  }, [onDetected, onClose]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detectedCode, setDetectedCode] = useState(null);

  // ZXing keeps decoding after the tracks stop unless its controls are halted
  // first, which otherwise leaves the camera light on.
  const stopCamera = useCallback(async () => {
    try {
      if (controlsRef.current?.stop) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (videoRef.current?.srcObject) {
        for (const track of videoRef.current.srcObject.getTracks()) track.stop();
        videoRef.current.srcObject = null;
      }
      codeReaderRef.current?.reset?.();
    } catch {
      /* teardown is best-effort */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera needs HTTPS and a modern browser. Use a USB scanner or type the barcode instead.');
          setLoading(false);
          return;
        }

        const codeReader = new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        let deviceId;
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!devices.length) {
            setError('No camera found on this device.');
            setLoading(false);
            return;
          }
          const rear = devices.find((d) => /back|rear|environment/i.test(d.label || ''));
          deviceId = (rear || devices[0]).deviceId;
        } catch {
          deviceId = undefined; // browser refused enumeration; fall back to the default camera
        }

        controlsRef.current = await codeReader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
          if (!result || hasDetectedRef.current || !controlsRef.current) return;
          hasDetectedRef.current = true;
          const barcode = result.getText();
          setDetectedCode(barcode);
          stopCamera();
          handlersRef.current.onDetected(barcode);
          setTimeout(() => handlersRef.current.onClose(), 500);
        });
        setLoading(false);
      } catch (err) {
        const messages = {
          NotAllowedError: 'Camera permission denied. Allow camera access in your browser settings.',
          NotFoundError: 'No camera found on this device.',
          NotReadableError: 'Camera is already in use by another application.',
        };
        setError(messages[err?.name] || 'Could not start the camera. Use a USB scanner or type the barcode instead.');
        setLoading(false);
      }
    })();

    return () => { stopCamera(); };
  }, [stopCamera]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between bg-stone-900 p-4 text-white">
          <h3 className="text-base font-semibold">Scan barcode</h3>
          <button
            type="button"
            onClick={() => { stopCamera(); onClose(); }}
            className="rounded p-2 hover:bg-white/20"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-video flex-shrink-0 overflow-hidden bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
              <Loader className="h-8 w-8 animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-40 animate-pulse rounded-lg border-4 border-green-500 sm:h-32 sm:w-56" />
          </div>
          {detectedCode && (
            <div className="absolute inset-x-3 bottom-3 rounded bg-green-500 p-2 text-center font-semibold text-white">
              Detected: {detectedCode}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 bg-slate-50 p-4 text-center">
          {error ? (
            <p className="text-sm font-semibold text-red-600">{error}</p>
          ) : (
            <p className="text-sm text-slate-600">Align the barcode inside the green box. Hold steady in good light.</p>
          )}
        </div>
      </div>
    </div>
  );
}
