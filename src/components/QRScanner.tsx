import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { decodeQrFromCanvas } from "@/lib/qrCodes";

interface QRScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * Called with each decoded code. Return null to accept it (the scanner closes),
   * or a message explaining why it isn't the right code (scanning continues).
   */
  onCode: (text: string) => Promise<string | null> | string | null;
}

const SCAN_INTERVAL_MS = 200;

/**
 * In-app QR scanner. Frames are decoded on the device and never stored or sent;
 * the camera is released as soon as the dialog closes.
 */
const QRScanner = ({ open, onOpenChange, title, description, onCode }: QRScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCodeRef = useRef(onCode);
  const [problem, setProblem] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    let lastRejected = "";
    let attachedVideo: HTMLVideoElement | null = null;
    setProblem(null);
    setHint(null);

    const scan = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        // Decode a centred square at most 720 px wide: plenty for a QR code, cheap to scan.
        const side = Math.min(video.videoWidth, video.videoHeight);
        const scale = Math.min(1, 720 / side);
        canvas.width = canvas.height = Math.round(side * scale);
        canvas.getContext("2d", { willReadFrequently: true })?.drawImage(
          video,
          (video.videoWidth - side) / 2,
          (video.videoHeight - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height
        );
        const text = await decodeQrFromCanvas(canvas);
        if (stopped) return;
        if (text && text !== lastRejected) {
          const rejection = await onCodeRef.current(text);
          if (stopped) return;
          if (rejection === null) {
            onOpenChange(false);
            return;
          }
          lastRejected = text;
          setHint(rejection);
        }
      }
      timer = window.setTimeout(() => void scan(), SCAN_INTERVAL_MS);
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This device can't open the camera here.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        attachedVideo = video;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        void scan();
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setProblem(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access is off for Phantom. Allow it in your phone's settings, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this device."
              : "The camera couldn't be started. Close other apps using it and try again."
        );
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (attachedVideo) attachedVideo.srcObject = null;
    };
  }, [open, attempt, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {problem ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{problem}</p>
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/80" aria-hidden />
          </div>
        )}
        {hint && !problem && <p className="text-xs text-center text-destructive">{hint}</p>}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
};

export default QRScanner;
