'use client';

import React from 'react';
import AsciiCanvas from '@/components/animator/AsciiCanvas';
import AsciiControlPanel from '@/components/animator/AsciiControlPanel';
import {
  loadImageForAscii,
  loadGifForAscii,
  loadVideoForAscii,
  generateFrame,
  preprocessImage,
  drawAsciiFrame,
  getAnimationFrameCount,
  type AsciiConfig,
} from '@/lib/animations/ascii-engine';
// @ts-ignore - gif.js doesn't have proper ESM support
import GIF from 'gif.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { type Lang, getTexts } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

export default function BugsAnimatorPage() {
  const [config, setConfig] = React.useState<AsciiConfig>({
    width: 1200,
    height: 1200,
    cellSize: 8,
    fontSize: 27,
    backgroundChar: '-',
    backgroundColor: '#e8d7c9',
    canvasBackgroundColor: '#361a07',
    density: 0,
    spacing: 0,
    animationSpeed: 10,
    trail: false,
    preprocessing: {
      blur: 0,
      grain: 0,
      gamma: 0.33,
      blackPoint: 249,
      whitePoint: 20,
      threshold: 237,
      showEffect: true,
      invert: true,
      dithering: true,
      ditheringStrength: 65,
    },
    useBrightnessMapping: true,
    brightnessLevels: [
      { threshold: 60,  char: '◼', name: 'Very Dark' },
      { threshold: 80,  char: '▓', name: 'Custom' },
      { threshold: 163, char: '▒', name: 'Dark' },
      { threshold: 196, char: '░', name: 'Dark-Medium' },
      { threshold: 240, char: '∴', name: 'Medium-Light' },
      { threshold: 241, char: '✕', name: 'Medium' },
      { threshold: 250, char: '⋮', name: 'Light' },
      { threshold: 255, char: '・', name: 'Very Light' },
    ],
    gifExportQuality: 21,
    gifExportScale: 1.0,
    importResolution: 150,
    imageScale: 1.0,
    imageOffsetX: 0,
    imageOffsetY: 0,
    loopMode: 'normal',
  });

  const [playing, setPlaying] = React.useState(true);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingProgress, setRecordingProgress] = React.useState(0);
  const [recordingType, setRecordingType] = React.useState<'gif' | 'webm' | 'mp4'>('gif');
  const [videoLoadingProgress, setVideoLoadingProgress] = React.useState(0);
  const [isLoadingVideo, setIsLoadingVideo] = React.useState(false);
  const [uploadedImageBase64, setUploadedImageBase64] = React.useState<string | null>(null);
  const [isUploadedGif, setIsUploadedGif] = React.useState<boolean>(false);
  const [lang, setLang] = React.useState<Lang>('en');
  const [isDragging, setIsDragging] = React.useState(false);
  const [fileSizeDialog, setFileSizeDialog] = React.useState<{ open: boolean; file: File | null; mb: string; rec: number }>({ open: false, file: null, mb: '0', rec: 5 });
  const [githubStars, setGithubStars] = React.useState<number | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const mainUploadRef = React.useRef<HTMLInputElement>(null);
  const tx = getTexts(lang);
  const ht = tx.header;
  const pt = tx.playback;

  React.useEffect(() => {
    fetch('https://api.github.com/repos/yukgong/ascii-art-animator')
      .then(r => r.json())
      .then(d => { if (typeof d.stargazers_count === 'number') setGithubStars(d.stargazers_count); })
      .catch(() => {});
  }, []);

  const isVideoFile = (file: File) =>
    file.type.startsWith('video/') ||
    /\.(mp4|webm|mov|avi|mkv|ogv|m4v)$/i.test(file.name);

  const processFile = async (file: File) => {
    try {
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const isVideo = isVideoFile(file);

      // Detect natural dimensions for canvas auto-sizing
      let naturalWidth = 0, naturalHeight = 0;
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((res) => {
        if (isVideo) {
          const v = document.createElement('video');
          v.onloadedmetadata = () => { naturalWidth = v.videoWidth; naturalHeight = v.videoHeight; res(); };
          v.onerror = () => res();
          v.src = objectUrl;
        } else {
          const img = new Image();
          img.onload = () => { naturalWidth = img.naturalWidth; naturalHeight = img.naturalHeight; res(); };
          img.onerror = () => res();
          img.src = objectUrl;
        }
      });
      URL.revokeObjectURL(objectUrl);

      // Compute canvas dimensions from natural aspect ratio, max 1200px per side
      const MAX_DIM = 1200;
      let newWidth = config.width;
      let newHeight = config.height;
      if (naturalWidth > 0 && naturalHeight > 0) {
        const aspect = naturalWidth / naturalHeight;
        if (aspect >= 1) {
          newWidth = Math.min(naturalWidth, MAX_DIM);
          newHeight = Math.round(newWidth / aspect);
        } else {
          newHeight = Math.min(naturalHeight, MAX_DIM);
          newWidth = Math.round(newHeight * aspect);
        }
        newWidth = Math.round(newWidth / 2) * 2;
        newHeight = Math.round(newHeight / 2) * 2;
      }

      // Grid resolution based on new canvas aspect ratio
      const resolution = config.importResolution ?? 150;
      const newAspect = newWidth / newHeight;
      let cols, rows;
      if (newAspect >= 1) {
        cols = resolution;
        rows = Math.max(1, Math.round(resolution / newAspect));
      } else {
        rows = resolution;
        cols = Math.max(1, Math.round(resolution * newAspect));
      }

      setIsUploadedGif(isGif || isVideo);

      if (!isVideo) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => { resolve(e.target?.result as string); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setUploadedImageBase64(base64);
      } else {
        setUploadedImageBase64(null);
      }

      if (isVideo) {
        setIsLoadingVideo(true);
        setVideoLoadingProgress(0);
        try {
          const { frames, delay } = await Promise.race([
            loadVideoForAscii(file, cols, rows, 50, (p) => setVideoLoadingProgress(p)),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Video parsing timeout (60s)')), 60000)),
          ]) as Awaited<ReturnType<typeof loadVideoForAscii>>;
          setConfig((prev) => ({
            ...prev,
            width: newWidth,
            height: newHeight,
            imageData: frames[0],
            imageFrames: frames,
            gifFrameDelay: delay,
          }));
        } catch (videoError) {
          toast.error(tx.toast.videoLoadError(videoError instanceof Error ? videoError.message : 'Unknown error'));
        } finally {
          setIsLoadingVideo(false);
          setVideoLoadingProgress(0);
        }
      } else if (isGif) {
        try {
          const { frames, delay } = await Promise.race([
            loadGifForAscii(file, cols, rows),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GIF parsing timeout (30s)')), 30000)),
          ]) as Awaited<ReturnType<typeof loadGifForAscii>>;
          setConfig((prev) => ({
            ...prev,
            width: newWidth,
            height: newHeight,
            imageData: frames[0],
            imageFrames: frames,
            gifFrameDelay: delay,
          }));
        } catch (gifError) {
          toast.error(tx.toast.gifLoadError(gifError instanceof Error ? gifError.message : 'Unknown error'));
          const imageData = await loadImageForAscii(file, cols, rows);
          setConfig((prev) => ({ ...prev, width: newWidth, height: newHeight, imageData, imageFrames: undefined, gifFrameDelay: undefined }));
        }
      } else {
        const imageData = await loadImageForAscii(file, cols, rows);
        setConfig((prev) => ({ ...prev, width: newWidth, height: newHeight, imageData, imageFrames: undefined, gifFrameDelay: undefined }));
      }
    } catch (error) {
      toast.error(tx.toast.imageLoadError(error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleImageUpload = async (file: File) => {
    const fileSizeMB = file.size / (1024 * 1024);
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isVideo = isVideoFile(file);
    const maxSize = isVideo ? 200 : isGif ? 3 : 5;

    if (fileSizeMB > maxSize) {
      setFileSizeDialog({ open: true, file, mb: fileSizeMB.toFixed(1), rec: maxSize });
      return;
    }

    await processFile(file);
  };

  // Export settings to JSON file
  const handleExportSettings = () => {
    const { imageData, imageFrames, gifFrameDelay, ...exportConfig } = config;
    const json = JSON.stringify(exportConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ascii-art-settings-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import settings from JSON file
  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedConfig = JSON.parse(event.target?.result as string);
        setConfig((prev) => ({ ...prev, ...importedConfig }));
        toast.success(tx.toast.settingsImported);
      } catch {
        toast.error(tx.toast.settingsImportError);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportFrame = () => {
    const rawFrame = (config.imageFrames && config.imageFrames.length > 0)
      ? config.imageFrames[0]
      : config.imageData;
    if (!rawFrame) return;

    const imageData = (rawFrame.width > 0 && config.preprocessing.showEffect)
      ? preprocessImage(rawFrame, config.preprocessing)
      : rawFrame;

    const frame = generateFrame({
      ...config,
      imageData,
      preprocessing: { ...config.preprocessing, showEffect: false },
    });

    const offscreen = document.createElement('canvas');
    offscreen.width = config.width;
    offscreen.height = config.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const actualCellSize = config.cellSize + config.spacing;
    const fontSize = config.fontSize ?? config.cellSize * 0.8;
    const cols = Math.floor(config.width / config.cellSize);
    const rows = Math.floor(config.height / config.cellSize);

    ctx.fillStyle = config.canvasBackgroundColor || '#000000';
    ctx.fillRect(0, 0, config.width, config.height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const char = frame.grid[row][col];
        if (char === ' ') continue;
        ctx.fillStyle = frame.colors[row][col];
        ctx.fillText(char, col * actualCellSize + actualCellSize / 2, row * actualCellSize + actualCellSize / 2);
      }
    }

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ascii-art.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleRecordWebM = async () => {
    const canvas = document.getElementById('ascii-main-canvas') as HTMLCanvasElement;
    if (!canvas || isRecording) return;

    setIsRecording(true);
    setRecordingProgress(0);

    const stream = canvas.captureStream(config.animationSpeed);

    // Try different codecs with fallback
    let options: MediaRecorderOptions = { videoBitsPerSecond: 2500000 };
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options.mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options.mimeType = 'video/webm;codecs=vp8';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options.mimeType = 'video/webm';
    }

    const mediaRecorder = new MediaRecorder(stream, options);

    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ascii-art-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setRecordingProgress(0);
    };

    mediaRecorder.start();

    // Calculate duration: use GIF length if available, otherwise 3 seconds
    const duration = config.imageFrames && config.imageFrames.length > 1
      ? (config.imageFrames.length / config.animationSpeed) * 1000
      : 3000;
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      setRecordingProgress(progress);

      if (elapsed >= duration) {
        clearInterval(progressInterval);
        mediaRecorder.stop();
      }
    }, 100);
  };

  const handleRecordGif = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setRecordingProgress(0);

    const scale = config.gifExportScale ?? 1.0;
    const exportWidth = Math.floor(config.width * scale);
    const exportHeight = Math.floor(config.height * scale);

    const isAnimated = config.imageFrames && config.imageFrames.length > 1;
    const hasEffect = (config.animationType ?? 'none') !== 'none';
    const frameCount = isAnimated
      ? config.imageFrames!.length
      : hasEffect ? getAnimationFrameCount(config) : 1;
    const frameDelay = Math.round(1000 / config.animationSpeed);

    const offscreen = document.createElement('canvas');
    offscreen.width = config.width;
    offscreen.height = config.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) { setIsRecording(false); return; }

    const gif = new GIF({
      workers: 2,
      quality: 31 - (config.gifExportQuality ?? 21),
      workerScript: '/gif.worker.js',
      width: exportWidth,
      height: exportHeight,
    });

    gif.on('finished', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascii-art-${Date.now()}.gif`;
      a.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setRecordingProgress(0);
    });

    gif.on('progress', (progress: number) => {
      setRecordingProgress(Math.round(50 + progress * 50));
    });

    for (let i = 0; i < frameCount; i++) {
      const rawFrame = isAnimated ? config.imageFrames![i] : config.imageData;
      const imageData = (rawFrame && rawFrame.width > 0 && config.preprocessing.showEffect)
        ? preprocessImage(rawFrame, config.preprocessing)
        : rawFrame;

      const frame = generateFrame({
        ...config,
        imageData,
        preprocessing: { ...config.preprocessing, showEffect: false },
      });

      drawAsciiFrame(ctx, frame, config, i);

      if (scale < 1) {
        const scaled = document.createElement('canvas');
        scaled.width = exportWidth;
        scaled.height = exportHeight;
        scaled.getContext('2d')?.drawImage(offscreen, 0, 0, exportWidth, exportHeight);
        gif.addFrame(scaled, { copy: true, delay: frameDelay });
      } else {
        gif.addFrame(offscreen, { copy: true, delay: frameDelay });
      }

      setRecordingProgress(Math.round(((i + 1) / frameCount) * 50));
      await new Promise(r => setTimeout(r, 0));
    }

    gif.render();
  };

  const handleRecordMp4 = async () => {
    if (isRecording) return;

    if (typeof VideoEncoder === 'undefined') {
      toast.error('MP4 export requires a modern browser with WebCodecs support (Chrome/Edge/Safari 16.4+).');
      return;
    }

    setIsRecording(true);
    setRecordingProgress(0);

    const scale = config.gifExportScale ?? 1.0;
    const exportWidth = Math.floor(config.width * scale);
    const exportHeight = Math.floor(config.height * scale);

    const isAnimated = config.imageFrames && config.imageFrames.length > 1;
    const hasEffect = (config.animationType ?? 'none') !== 'none';
    const frameCount = isAnimated
      ? config.imageFrames!.length
      : hasEffect ? getAnimationFrameCount(config) : 30;
    const fps = config.animationSpeed;

    const offscreen = document.createElement('canvas');
    offscreen.width = config.width;
    offscreen.height = config.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) { setIsRecording(false); return; }

    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: exportWidth, height: exportHeight },
      fastStart: 'in-memory',
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { toast.error(`Encoding error: ${e.message}`); },
    });

    encoder.configure({
      codec: 'avc1.420033',
      width: exportWidth,
      height: exportHeight,
      bitrate: 2_500_000,
      framerate: fps,
    });

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = exportWidth;
    scaledCanvas.height = exportHeight;
    const scaledCtx = scaledCanvas.getContext('2d');
    if (!scaledCtx) { setIsRecording(false); return; }

    for (let i = 0; i < frameCount; i++) {
      const rawFrame = isAnimated ? config.imageFrames![i % config.imageFrames!.length] : config.imageData;
      const imageData = (rawFrame && rawFrame.width > 0 && config.preprocessing.showEffect)
        ? preprocessImage(rawFrame, config.preprocessing)
        : rawFrame;

      const frame = generateFrame({
        ...config,
        imageData,
        preprocessing: { ...config.preprocessing, showEffect: false },
      });

      drawAsciiFrame(ctx, frame, config, i);

      scaledCtx.drawImage(offscreen, 0, 0, exportWidth, exportHeight);

      const timestamp = Math.round((i / fps) * 1_000_000);
      const videoFrame = new VideoFrame(scaledCanvas, { timestamp });
      encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
      videoFrame.close();

      setRecordingProgress(Math.round(((i + 1) / frameCount) * 90));
      await new Promise(r => setTimeout(r, 0));
    }

    await encoder.flush();
    muxer.finalize();

    setRecordingProgress(100);

    const { buffer } = muxer.target;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ascii-art-${Date.now()}.mp4`;
    link.click();
    URL.revokeObjectURL(url);

    setIsRecording(false);
    setRecordingProgress(0);
  };

  const handleRecord = () => {
    if (recordingType === 'gif') {
      handleRecordGif();
    } else if (recordingType === 'mp4') {
      handleRecordMp4();
    } else {
      handleRecordWebM();
    }
  };

  // Generate preprocessed brightness maps from GIF frames
  // Returns Base64-encoded brightness maps for offline playback
  const generatePreprocessedFrames = (): { frames: string[]; cols: number; rows: number; delay: number } | null => {
    if (!config.imageFrames || config.imageFrames.length === 0) return null;

    const cols = Math.floor(config.width / config.cellSize);
    const rows = Math.floor(config.height / config.cellSize);

    // Helper function to apply preprocessing to a frame (matches ascii-engine.ts)
    const applyPreprocessingToFrame = (frameData: Uint8ClampedArray, width: number, height: number) => {
      const data = new Uint8ClampedArray(frameData); // Copy to avoid mutating original
      const preprocessing = config.preprocessing;

      if (!preprocessing.showEffect) return data;

      // Gamma correction
      if (preprocessing.gamma !== 1.0) {
        const gammaCorrection = 1 / preprocessing.gamma;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.pow(data[i] / 255, gammaCorrection) * 255;
          data[i + 1] = Math.pow(data[i + 1] / 255, gammaCorrection) * 255;
          data[i + 2] = Math.pow(data[i + 2] / 255, gammaCorrection) * 255;
        }
      }

      // Black/White Point
      const range = preprocessing.whitePoint - preprocessing.blackPoint;
      if (range > 0) {
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            let value = data[i + c];
            value = ((value - preprocessing.blackPoint) / range) * 255;
            value = Math.max(0, Math.min(255, value));
            data[i + c] = value;
          }
        }
      }

      // Blur
      if (preprocessing.blur > 0) {
        const tempData = new Uint8ClampedArray(data);
        const radius = Math.floor(preprocessing.blur);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const idx = (ny * width + nx) * 4;
                  r += tempData[idx];
                  g += tempData[idx + 1];
                  b += tempData[idx + 2];
                  count++;
                }
              }
            }
            const idx = (y * width + x) * 4;
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
          }
        }
      }

      // Grain - skip for export (random noise would be different each time)
      // The grain will be re-applied at runtime if needed

      // Invert (preserve white backgrounds)
      if (preprocessing.invert) {
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness < 240) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
        }
      }

      return data;
    };

    const frames = config.imageFrames.map((frame) => {
      // Apply preprocessing to frame first
      const processedData = applyPreprocessingToFrame(frame.data, frame.width, frame.height);

      // Extract brightness map from processed frame
      const brightnessMap = new Uint8Array(cols * rows);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const imgX = Math.floor((col / cols) * frame.width);
          const imgY = Math.floor((row / rows) * frame.height);
          const pixelIndex = (imgY * frame.width + imgX) * 4;
          const r = processedData[pixelIndex];
          const g = processedData[pixelIndex + 1];
          const b = processedData[pixelIndex + 2];
          const brightness = Math.round((r + g + b) / 3);
          brightnessMap[row * cols + col] = brightness;
        }
      }

      // Convert Uint8Array to Base64
      let binary = '';
      for (let i = 0; i < brightnessMap.length; i++) {
        binary += String.fromCharCode(brightnessMap[i]);
      }
      return btoa(binary);
    });

    return {
      frames,
      cols,
      rows,
      delay: config.gifFrameDelay || 100,
    };
  };

  const generateReactComponent = (imageFileName: string | null, isGif: boolean, configJSON: string) => {
    return `'use client';

import { useEffect, useRef, useState } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';

// Type definitions
interface AsciiConfig {
  width: number;
  height: number;
  cellSize: number;
  fontSize: number;
  backgroundChar: string;
  backgroundColor: string;
  canvasBackgroundColor: string;
  density: number;
  spacing: number;
  animationSpeed: number;
  trail: boolean;
  preprocessing: {
    blur: number;
    grain: number;
    gamma: number;
    blackPoint: number;
    whitePoint: number;
    threshold: number;
    showEffect: boolean;
    dithering: boolean;
    ditheringStrength: number;
    invert: boolean;
  };
  useBrightnessMapping: boolean;
  brightnessLevels: Array<{
    threshold: number;
    char: string;
    name: string;
  }>;
}

interface AnimationProps {
  config?: Partial<AsciiConfig>;
  imageUrl?: string;
  isGif?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_CONFIG: AsciiConfig = ${configJSON};

export default function Animation({
  config: customConfig,
  imageUrl = ${imageFileName ? `'/${imageFileName}'` : 'null'},
  isGif = ${isGif},
  className,
  style,
}: AnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const config: AsciiConfig = { ...DEFAULT_CONFIG, ...customConfig };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = config.width;
    canvas.height = config.height;

    let lastTime = 0;
    let gifFrameIndex = 0;
    let imageFrames: ImageData[] | null = null;
    let gifFrameDelay = 100;
    let animationId: number;

    // ASCII Engine functions
    ${generateInlineEngine()}

    // Load GIF frames from file
    async function loadGifFrames(gifUrl: string): Promise<{ frames: ImageData[]; delay: number }> {
      // Fetch GIF file
      const response = await fetch(gifUrl);
      if (!response.ok) {
        throw new Error(\`Failed to load GIF: \${response.status} \${response.statusText}\`);
      }
      const arrayBuffer = await response.arrayBuffer();

      // Parse GIF using imported functions
      const gif = parseGIF(arrayBuffer);
      const frames = decompressFrames(gif, true);

      if (frames.length === 0) {
        throw new Error('No frames found in GIF');
      }

      // Get GIF dimensions
      const gifWidth = frames[0].dims.width;
      const gifHeight = frames[0].dims.height;
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);

      // Create persistent canvas for building frames
      const gifCanvas = document.createElement('canvas');
      gifCanvas.width = gifWidth;
      gifCanvas.height = gifHeight;
      const gifCtx = gifCanvas.getContext('2d');
      if (!gifCtx) throw new Error('Failed to get context');

      const imageFrames: ImageData[] = [];
      let totalDelay = 0;

      // Limit frames for performance (max 100 frames)
      const maxFrames = 100;
      const frameStep = frames.length > maxFrames ? Math.ceil(frames.length / maxFrames) : 1;
      const framesToProcess = frames.length > maxFrames
        ? frames.filter((_: any, i: number) => i % frameStep === 0).slice(0, maxFrames)
        : frames;

      // Process each frame
      for (let i = 0; i < framesToProcess.length; i++) {
        const frame = framesToProcess[i];
        const { dims, patch, delay, disposalType } = frame;

        if (!dims || !patch || patch.length === 0) continue;
        if (!dims.width || !dims.height || dims.width <= 0 || dims.height <= 0) continue;

        totalDelay += delay || 100;

        // Handle disposal method
        if (disposalType === 2) {
          gifCtx.clearRect(0, 0, gifWidth, gifHeight);
        }

        // Create ImageData for this frame patch
        const patchData = new ImageData(
          new Uint8ClampedArray(patch),
          dims.width,
          dims.height
        );

        // Draw patch at its position
        gifCtx.putImageData(patchData, dims.left, dims.top);

        // Get complete frame
        const completeFrame = gifCtx.getImageData(0, 0, gifWidth, gifHeight);

        // Scale to target size
        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get context');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cols, rows);

        // Create temp canvas for scaling
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = gifWidth;
        tempCanvas.height = gifHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Failed to get context');
        tempCtx.putImageData(completeFrame, 0, 0);

        // Calculate scaling
        const imgAspect = gifWidth / gifHeight;
        const targetAspect = cols / rows;

        let drawWidth = cols;
        let drawHeight = rows;
        let offsetX = 0;
        let offsetY = 0;

        if (imgAspect > targetAspect) {
          drawHeight = cols / imgAspect;
          offsetY = (rows - drawHeight) / 2;
        } else {
          drawWidth = rows * imgAspect;
          offsetX = (cols - drawWidth) / 2;
        }

        // Draw scaled frame
        ctx.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
        const scaledImageData = ctx.getImageData(0, 0, cols, rows);

        // Note: preprocessing will be applied in generateFrameWithBrightness
        // DO NOT apply here to avoid double-preprocessing

        imageFrames.push(scaledImageData);
      }

      const averageDelay = totalDelay > 0 ? Math.round(totalDelay / imageFrames.length) : 100;

      return { frames: imageFrames, delay: averageDelay };
    }

    // Load image helper
    async function loadImageData(url: string): Promise<ImageData | null> {
      if (!url) return null;

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const cols = Math.floor(config.width / config.cellSize);
          const rows = Math.floor(config.height / config.cellSize);

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = cols;
          tempCanvas.height = rows;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) {
            reject(new Error('Failed to get context'));
            return;
          }

          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, cols, rows);

          const imgAspect = img.width / img.height;
          const targetAspect = cols / rows;

          let drawWidth = cols;
          let drawHeight = rows;
          let offsetX = 0;
          let offsetY = 0;

          if (imgAspect > targetAspect) {
            drawHeight = cols / imgAspect;
            offsetY = (rows - drawHeight) / 2;
          } else {
            drawWidth = rows * imgAspect;
            offsetX = (cols - drawWidth) / 2;
          }

          tempCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          const imageData = tempCtx.getImageData(0, 0, cols, rows);

          // Note: preprocessing will be applied in generateFrameWithBrightness
          // DO NOT apply here to avoid double-preprocessing

          resolve(imageData);
        };
        img.onerror = reject;
        img.src = url;
      });
    }

    // Note: applyPreprocessing is defined in generateInlineEngine()

    // Initialize and load
    async function init() {
      try {
        if (imageUrl && isGif) {
          // Load GIF
          const gifData = await loadGifFrames(imageUrl);
          imageFrames = gifData.frames;
          gifFrameDelay = gifData.delay;
          (config as any).imageData = imageFrames[0];
        } else if (imageUrl) {
          // Load static image
          const imgData = await loadImageData(imageUrl);
          if (imgData) {
            (config as any).imageData = imgData;
          }
        }

        animate(0);
      } catch {
        // Silent error handling
      }
    }

    function animate(timestamp: number) {
      const frameInterval = 1000 / config.animationSpeed;

      if (timestamp - lastTime >= frameInterval) {
        lastTime = timestamp;

        if (imageFrames && imageFrames.length > 1) {
          gifFrameIndex = (gifFrameIndex + 1) % imageFrames.length;
          (config as any).imageData = imageFrames[gifFrameIndex];
        }

        const frame = generateFrame(config);
        drawFrame(ctx!, frame, config);
      }

      animationId = requestAnimationFrame(animate);
    }

    init();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [customConfig, imageUrl, isGif]);

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
`;
  };

  const handleExportCode = async () => {
    const zip = new JSZip();

    // Calculate font sizes explicitly (matching AsciiCanvas.tsx logic)
    const calculatedFontSize = config.fontSize ?? Math.round(config.cellSize * 0.8);

    // Build export config with explicit values
    const exportConfig = {
      width: config.width,
      height: config.height,
      cellSize: config.cellSize,
      fontSize: calculatedFontSize,
      backgroundChar: config.backgroundChar,
      backgroundColor: config.backgroundColor,
      canvasBackgroundColor: config.canvasBackgroundColor,
      density: config.density,
      spacing: config.spacing,
      animationSpeed: config.animationSpeed,
      trail: config.trail,
      preprocessing: config.preprocessing,
      useBrightnessMapping: config.useBrightnessMapping,
      brightnessLevels: config.brightnessLevels,
    };
    const configJSON = JSON.stringify(exportConfig, null, 2);

    // Generate preprocessed frames for GIF (brightness maps encoded as Base64)
    const preprocessedFrames = generatePreprocessedFrames();

    const imageFileName = uploadedImageBase64 ? (isUploadedGif ? 'animation.gif' : 'animation.png') : null;
    const isGif = isUploadedGif;
    const hasPreprocessedFrames = preprocessedFrames !== null && preprocessedFrames.frames.length > 0;
    // For static images, embed base64 directly so HTML works without a server
    const embeddedImageUrl = !hasPreprocessedFrames && !isUploadedGif ? uploadedImageBase64 : null;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASCII Art ASCII Animation</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: monospace;
    }
    canvas {
      border: 1px solid #333;
      image-rendering: pixelated;
    }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    // Configuration (all values explicit, matches screen exactly)
    const config = ${configJSON};

    // Preprocessed GIF frames (brightness maps encoded as Base64)
    const preprocessedFrames = ${hasPreprocessedFrames ? JSON.stringify(preprocessedFrames) : 'null'};

    // Static image embedded as base64 data URL (works without a server)
    const imageUrl = ${embeddedImageUrl ? `'${embeddedImageUrl}'` : 'null'};

    // ============================================
    // ASCII Engine (100% matching AsciiCanvas.tsx)
    // ============================================
    ${generateInlineEngine()}

    // Decode Base64 brightness map to 2D array
    function decodeBrightnessMap(base64, cols, rows) {
      const binary = atob(base64);
      const brightnessMap = [];
      for (let row = 0; row < rows; row++) {
        brightnessMap[row] = [];
        for (let col = 0; col < cols; col++) {
          brightnessMap[row][col] = binary.charCodeAt(row * cols + col);
        }
      }
      return brightnessMap;
    }

    async function loadImageData(imageUrl) {
      if (!imageUrl) return null;

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const cols = Math.floor(config.width / config.cellSize);
          const rows = Math.floor(config.height / config.cellSize);

          const canvas = document.createElement('canvas');
          canvas.width = cols;
          canvas.height = rows;
          const ctx = canvas.getContext('2d');

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, cols, rows);

          const imgAspect = img.width / img.height;
          const targetAspect = cols / rows;

          let drawWidth = cols;
          let drawHeight = rows;
          let offsetX = 0;
          let offsetY = 0;

          if (imgAspect > targetAspect) {
            drawHeight = cols / imgAspect;
            offsetY = (rows - drawHeight) / 2;
          } else {
            drawWidth = rows * imgAspect;
            offsetX = (cols - drawWidth) / 2;
          }

          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          const imageData = ctx.getImageData(0, 0, cols, rows);
          resolve(imageData);
        };
        img.onerror = reject;
        img.src = imageUrl;
      });
    }

    // Initialize canvas
    const canvas = document.getElementById('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext('2d');

    let lastTime = 0;
    let gifFrameIndex = 0;

    // Decoded brightness maps (for GIF)
    let decodedBrightnessMaps = null;

    // Static image data
    let staticImageData = null;

    // Initialize and start animation
    (async function() {
      try {
        if (preprocessedFrames) {
          // Decode all brightness maps from Base64 (GIF case)
          decodedBrightnessMaps = preprocessedFrames.frames.map(
            base64 => decodeBrightnessMap(base64, preprocessedFrames.cols, preprocessedFrames.rows)
          );
        } else if (imageUrl) {
          staticImageData = await loadImageData(imageUrl);
        }
      } catch {
        // Silent error handling
      }

      // Start animation
      requestAnimationFrame(animate);
    })();

    function animate(timestamp) {
      const frameInterval = 1000 / config.animationSpeed;

      if (timestamp - lastTime >= frameInterval) {
        lastTime = timestamp;

        // Get current brightness map (for GIF) or static image data
        let currentBrightnessMap = null;
        let currentImageData = null;

        if (decodedBrightnessMaps && decodedBrightnessMaps.length > 0) {
          // GIF: advance frame and get brightness map
          gifFrameIndex = (gifFrameIndex + 1) % decodedBrightnessMaps.length;
          currentBrightnessMap = decodedBrightnessMaps[gifFrameIndex];
        } else if (staticImageData) {
          // Static image: use loaded image data
          currentImageData = staticImageData;
        }

        // Generate and draw frame
        const frame = generateFrameWithBrightness(config, currentBrightnessMap, currentImageData);
        drawFrame(ctx, frame, config);
      }

      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

    // Create React component file
    const reactComponentContent = generateReactComponent(imageFileName, isGif, configJSON);

    const readmeContent = `# ASCII Art Animation

---

## English

### React / Next.js

1. Copy \`animation.tsx\` → \`components/\`
${imageFileName ? `2. Copy \`${imageFileName}\` → \`public/\`\n` : ''}
3. Use it:

\`\`\`tsx
import Animation from '@/components/animation';

export default function Page() {
  return <Animation />;
}
\`\`\`

### HTML (Quick Test)

Double-click \`index.html\` — no server required.

### Customization

Pass config values as props:

\`\`\`tsx
<Animation
  config={{
    fontSize: 12,
    animationSpeed: 20,
  }}
/>
\`\`\`

### Key Config Options

| Option | Description |
|--------|-------------|
| fontSize | ASCII character size |
| cellSize | Grid cell size |
| animationSpeed | FPS |
| backgroundColor | ASCII character color |
| backgroundChar | Default background character |

---

## 한국어

### React / Next.js

1. \`animation.tsx\` → \`components/\` 에 복사
${imageFileName ? `2. \`${imageFileName}\` → \`public/\` 에 복사\n` : ''}
3. 사용:

\`\`\`tsx
import Animation from '@/components/animation';

export default function Page() {
  return <Animation />;
}
\`\`\`

### HTML (빠른 테스트)

\`index.html\` 더블클릭 — 서버 없이 바로 실행됩니다.

### 커스터마이징

config.json 설정값을 props로 전달:

\`\`\`tsx
<Animation
  config={{
    fontSize: 12,
    animationSpeed: 20,
  }}
/>
\`\`\`

### 주요 설정값

| 설정 | 설명 |
|------|------|
| fontSize | ASCII 문자 크기 |
| cellSize | 그리드 셀 크기 |
| animationSpeed | FPS |
| backgroundColor | ASCII 문자 색상 |
| backgroundChar | 기본 배경 문자 |

---
Made with 🎨 by ASCII Art Animator
`;

    // Add files to ZIP
    zip.file('index.html', htmlContent);
    zip.file('animation.tsx', reactComponentContent);
    zip.file('config.json', configJSON);
    zip.file('README.md', readmeContent);

    // Add image/GIF file if present (for React component use)
    if (uploadedImageBase64 && imageFileName) {
      // Convert base64 to blob
      const base64Data = uploadedImageBase64.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      zip.file(imageFileName, bytes);
    }

    // Generate and download ZIP
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `ascii-art-animation-${Date.now()}.zip`);
  };

  const generateInlineEngine = () => {
    return `
    // ============================================
    // Brightness-based character + color selection
    // ============================================
    function selectLevelByBrightness(brightness, sortedLevels, fallbackChar, fallbackColor) {
      for (const level of sortedLevels) {
        if (brightness <= level.threshold) {
          return { char: level.char, color: level.color || fallbackColor };
        }
      }
      return { char: fallbackChar, color: fallbackColor };
    }

    // ============================================
    // Floyd-Steinberg dithering
    // (matches ascii-engine.ts applyDithering)
    // ============================================
    function applyDithering(brightnessMap, levels, strength) {
      const rows = brightnessMap.length;
      const cols = brightnessMap[0]?.length || 0;
      const dithered = brightnessMap.map(row => [...row]);
      const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const oldPixel = dithered[y][x];
          let newPixel = 255;

          for (const level of sorted) {
            if (oldPixel <= level.threshold) {
              newPixel = level.threshold;
              break;
            }
          }

          dithered[y][x] = newPixel;
          const error = (oldPixel - newPixel) * (strength / 100);

          if (x + 1 < cols) {
            dithered[y][x + 1] = Math.max(0, Math.min(255, dithered[y][x + 1] + error * 7 / 16));
          }
          if (y + 1 < rows) {
            if (x > 0) {
              dithered[y + 1][x - 1] = Math.max(0, Math.min(255, dithered[y + 1][x - 1] + error * 3 / 16));
            }
            dithered[y + 1][x] = Math.max(0, Math.min(255, dithered[y + 1][x] + error * 5 / 16));
            if (x + 1 < cols) {
              dithered[y + 1][x + 1] = Math.max(0, Math.min(255, dithered[y + 1][x + 1] + error * 1 / 16));
            }
          }
        }
      }
      return dithered;
    }

    // ============================================
    // Image preprocessing
    // (matches ascii-engine.ts preprocessImage)
    // Returns a NEW ImageData to avoid modifying original
    // ============================================
    function applyPreprocessing(imageData, preprocessing) {
      const { gamma, blackPoint, whitePoint, blur, grain, invert } = preprocessing;
      const width = imageData.width;
      const height = imageData.height;

      // Create a copy to avoid modifying original (prevents accumulation on loops)
      const processed = new ImageData(width, height);
      const data = processed.data;

      // Copy original data first
      for (let i = 0; i < imageData.data.length; i++) {
        data[i] = imageData.data[i];
      }

      // Gamma correction
      if (gamma !== 1.0) {
        const gammaCorrection = 1 / gamma;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.pow(data[i] / 255, gammaCorrection) * 255;
          data[i + 1] = Math.pow(data[i + 1] / 255, gammaCorrection) * 255;
          data[i + 2] = Math.pow(data[i + 2] / 255, gammaCorrection) * 255;
        }
      }

      // Black/White Point
      const range = whitePoint - blackPoint;
      if (range > 0) {
        for (let i = 0; i < data.length; i += 4) {
          for (let c = 0; c < 3; c++) {
            let value = data[i + c];
            value = ((value - blackPoint) / range) * 255;
            value = Math.max(0, Math.min(255, value));
            data[i + c] = value;
          }
        }
      }

      // Blur
      if (blur > 0) {
        const tempData = new Uint8ClampedArray(data);
        const radius = Math.floor(blur);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const idx = (ny * width + nx) * 4;
                  r += tempData[idx];
                  g += tempData[idx + 1];
                  b += tempData[idx + 2];
                  count++;
                }
              }
            }
            const idx = (y * width + x) * 4;
            data[idx] = r / count;
            data[idx + 1] = g / count;
            data[idx + 2] = b / count;
          }
        }
      }

      // Grain
      if (grain > 0) {
        const grainAmount = grain / 100;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 255 * grainAmount;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
      }

      // Invert
      if (invert) {
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness < 240) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
        }
      }

      return processed;
    }

    // ============================================
    // Frame generation with pre-computed brightness map
    // (for GIF: uses decoded brightness map directly)
    // (for static image: extracts brightness from imageData)
    // (matches ascii-engine.ts generateFrame)
    // ============================================
    function generateFrameWithBrightness(config, precomputedBrightnessMap, imageData) {
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);
      const grid = [];
      const colors = [];

      // Build brightness map
      let brightnessMap = precomputedBrightnessMap;

      // If no precomputed map but has imageData, extract brightness
      if (!brightnessMap && imageData) {
        // Apply preprocessing if enabled (returns NEW ImageData, doesn't modify original)
        let processedImageData = imageData;
        if (config.preprocessing && config.preprocessing.showEffect) {
          processedImageData = applyPreprocessing(imageData, config.preprocessing);
        }

        brightnessMap = [];
        for (let row = 0; row < rows; row++) {
          brightnessMap[row] = [];
          for (let col = 0; col < cols; col++) {
            const imgX = Math.floor((col / cols) * processedImageData.width);
            const imgY = Math.floor((row / rows) * processedImageData.height);
            const pixelIndex = (imgY * processedImageData.width + imgX) * 4;
            const r = processedImageData.data[pixelIndex];
            const g = processedImageData.data[pixelIndex + 1];
            const b = processedImageData.data[pixelIndex + 2];
            brightnessMap[row][col] = (r + g + b) / 3;
          }
        }
      }

      // Apply dithering if enabled
      if (brightnessMap && config.preprocessing && config.preprocessing.dithering &&
          config.useBrightnessMapping && config.brightnessLevels && config.brightnessLevels.length > 0) {
        brightnessMap = applyDithering(brightnessMap, config.brightnessLevels, config.preprocessing.ditheringStrength);
      }

      // Generate grid
      const sortedLevels = config.brightnessLevels
        ? [...config.brightnessLevels].sort((a, b) => a.threshold - b.threshold)
        : [];
      for (let row = 0; row < rows; row++) {
        grid[row] = [];
        colors[row] = [];
        for (let col = 0; col < cols; col++) {
          let char = ' ';
          let color = config.backgroundColor;

          if (brightnessMap && brightnessMap[row]) {
            const brightness = brightnessMap[row][col];

            if (config.useBrightnessMapping && sortedLevels.length > 0) {
              if (brightness < config.preprocessing.threshold) {
                const selected = selectLevelByBrightness(brightness, sortedLevels, config.backgroundChar, config.backgroundColor);
                char = selected.char;
                color = selected.color;
              }
            } else {
              const shouldDraw = brightness < config.preprocessing.threshold;
              char = shouldDraw ? config.backgroundChar : ' ';
            }
          } else {
            const hash = (row * 2654435761 + col * 2246822519) >>> 0;
            const pseudoRandom = (hash % 1000) / 1000;
            const shouldDraw = pseudoRandom < config.density;
            char = shouldDraw ? config.backgroundChar : ' ';
          }

          grid[row][col] = char;
          colors[row][col] = color;
        }
      }

      return { grid, colors };
    }

    // ============================================
    // Legacy generateFrame wrapper for React component
    // (React component uses config.imageData)
    // ============================================
    function generateFrame(config) {
      return generateFrameWithBrightness(config, null, config.imageData);
    }

    // ============================================
    // Draw frame to canvas
    // (matches AsciiCanvas.tsx drawFrame exactly)
    // ============================================
    function drawFrame(ctx, frame, config) {
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);
      const actualCellSize = config.cellSize + (config.spacing || 0);

      // Use explicit font sizes from config
      const backgroundFontSize = config.fontSize;

      // Clear canvas
      ctx.fillStyle = config.canvasBackgroundColor || '#000000';
      ctx.fillRect(0, 0, config.width, config.height);

      // Draw ASCII art
      ctx.font = backgroundFontSize + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const char = frame.grid[row][col];
          if (char === ' ') continue;

          const x = col * actualCellSize + actualCellSize / 2;
          const y = row * actualCellSize + actualCellSize / 2;

          ctx.fillStyle = frame.colors[row][col];
          ctx.fillText(char, x, y);
        }
      }
    }
    `;
  };

  const recordDuration = config.imageFrames && config.imageFrames.length > 1
    ? (config.imageFrames.length / config.animationSpeed).toFixed(1)
    : '3';

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 bg-card border-b px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ASCII Art Animator" className="w-7 h-7 shrink-0 object-cover" />
          <span className="font-semibold text-sm tracking-tight">ASCII Art Animator</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleExportSettings} className="text-xs h-8">
            {ht.exportSettings}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()} className="text-xs h-8">
            {ht.importSettings}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImportSettings}
            className="hidden"
          />
          <Separator orientation="vertical" className="h-4 mx-1" />
          <a
            href="https://github.com/yukgong/ascii-art-animator"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-sm"
          >
            <Star className="w-3.5 h-3.5" />
            <span>Star</span>
            {githubStars !== null && (
              <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-[10px] font-mono leading-none">
                {githubStars.toLocaleString()}
              </span>
            )}
          </a>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <button
            onClick={() => setLang(l => l === 'ko' ? 'en' : 'ko')}
            className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {lang === 'ko' ? 'EN' : '한국어'}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar — Controls */}
        <aside className="w-[320px] shrink-0 border-r bg-card overflow-y-auto">
          <AsciiControlPanel
            config={config}
            onChange={setConfig}
            lang={lang}
          />
        </aside>

        {/* Main Canvas Area */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-4 gap-3">
            {!config.imageData ? (
              /* ── Empty state: Upload dropzone + resolution ── */
              <Card className="w-full max-w-[720px] shadow-sm">
                <CardContent className="p-4 flex flex-col gap-4">
                  {/* Dropzone */}
                  <label
                    className={cn(
                      'aspect-square w-full border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 transition-colors',
                      isLoadingVideo ? 'cursor-default' : 'cursor-pointer',
                      isDragging ? 'bg-accent border-foreground' : 'hover:bg-accent/50'
                    )}
                    onDragOver={(e) => { if (!isLoadingVideo) { e.preventDefault(); setIsDragging(true); } }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (!isLoadingVideo) {
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleImageUpload(file);
                      }
                    }}
                  >
                    {isLoadingVideo ? (
                      <div className="flex flex-col items-center gap-3 select-none px-8 w-full">
                        <span className="text-sm font-medium text-muted-foreground">{tx.image.videoLoading}</span>
                        <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-foreground transition-all duration-150"
                            style={{ width: `${videoLoadingProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground/60 font-mono">{videoLoadingProgress}%</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 select-none">
                        <span className="text-sm font-medium text-muted-foreground">{tx.image.upload}</span>
                        <span className="text-xs text-muted-foreground/50">{tx.image.uploadSub}</span>
                      </div>
                    )}
                    <input
                      ref={mainUploadRef}
                      type="file"
                      accept="image/*,video/*,.gif,.mp4,.webm,.mov,.avi,.mkv"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
                      className="hidden"
                      disabled={isLoadingVideo}
                    />
                  </label>

                  {/* Import resolution — set before uploading */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{tx.image.importRes}</Label>
                      <span className="text-xs font-mono tabular-nums">{config.importResolution ?? 150}</span>
                    </div>
                    <Slider
                      value={config.importResolution ?? 150}
                      onValueChange={(v) => setConfig(prev => ({ ...prev, importResolution: v as number }))}
                      min={50} max={300} step={10}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground/50">
                      <span>{tx.image.fast}</span>
                      <span>{tx.image.detailed}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Image toolbar — replace + resolution */}
                <Card className="w-full max-w-[720px] shadow-sm">
                  <CardContent className="p-3 flex items-center gap-4">
                    <label className="flex items-center justify-center shrink-0 h-8 px-3 border border-dashed border-border cursor-pointer hover:bg-accent transition-colors">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{tx.image.replace}</span>
                      <input
                        type="file"
                        accept="image/*,video/*,.gif,.mp4,.webm,.mov,.avi,.mkv"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
                        className="hidden"
                      />
                    </label>
                    <Separator orientation="vertical" className="h-5" />
                    <div className="flex flex-1 items-center gap-3">
                      <span className="text-xs text-muted-foreground shrink-0">{tx.image.importRes}</span>
                      <Slider
                        value={config.importResolution ?? 150}
                        onValueChange={(v) => setConfig(prev => ({ ...prev, importResolution: v as number }))}
                        min={50} max={300} step={10}
                        className="flex-1"
                      />
                      <span className="text-xs font-mono tabular-nums w-8 text-right">{config.importResolution ?? 150}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Canvas Card */}
                <Card className="w-full max-w-[720px] shadow-sm">
                  <CardContent className="p-3">
                    <div className="w-full overflow-hidden" style={{ aspectRatio: `${config.width} / ${config.height}` }}>
                      <AsciiCanvas config={config} playing={playing} />
                    </div>
                  </CardContent>
                </Card>

                {/* Playback & Export Controls */}
                <Card className="w-full max-w-[720px] shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Playback */}
                      <Button
                        variant={playing ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => setPlaying(!playing)}
                        className="h-8 text-xs"
                      >
                        {playing ? pt.pause : pt.resume}
                      </Button>

                      <Separator orientation="vertical" className="h-5 mx-1" />

                      {/* Export */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportFrame}
                        disabled={isRecording}
                        className="h-8 text-xs"
                      >
                        {pt.exportPng}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCode}
                        disabled={isRecording}
                        className="h-8 text-xs"
                      >
                        {pt.exportCode}
                      </Button>

                      {/* Record — pushed to the right */}
                      <div className="flex items-center gap-2 ml-auto">
                        <Select
                          value={recordingType}
                          onValueChange={(v) => setRecordingType(v as 'gif' | 'webm' | 'mp4')}
                          disabled={isRecording}
                        >
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gif">GIF</SelectItem>
                            <SelectItem value="webm">WebM</SelectItem>
                            <SelectItem value="mp4">MP4</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={handleRecord}
                          disabled={isRecording}
                          className="h-8 text-xs"
                        >
                          {isRecording
                            ? pt.recording(recordingProgress)
                            : pt.record(recordingType.toUpperCase(), recordDuration)}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>

      <Dialog open={fileSizeDialog.open} onOpenChange={(open) => setFileSizeDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>⚠️</span>
              {tx.fileSizeWarning.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {tx.fileSizeWarning.body(fileSizeDialog.mb, String(fileSizeDialog.rec))}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileSizeDialog(prev => ({ ...prev, open: false }))}>
              {tx.fileSizeWarning.cancel}
            </Button>
            <Button onClick={async () => {
              setFileSizeDialog(prev => ({ ...prev, open: false }));
              if (fileSizeDialog.file) await processFile(fileSizeDialog.file);
            }}>
              {tx.fileSizeWarning.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
