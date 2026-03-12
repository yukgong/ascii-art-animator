'use client';

import React from 'react';
import AsciiCanvas from '@/components/animator/AsciiCanvas';
import AsciiControlPanel from '@/components/animator/AsciiControlPanel';
import {
  loadImageForAscii,
  loadGifForAscii,
  DEFAULT_BRIGHTNESS_LEVELS,
  type AsciiConfig,
} from '@/lib/animations/ascii-engine';
import Link from 'next/link';
// @ts-ignore - gif.js doesn't have proper ESM support
import GIF from 'gif.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function BugsAnimatorPage() {
  const [config, setConfig] = React.useState<AsciiConfig>({
    width: 800,
    height: 800,
    cellSize: 15,
    backgroundChar: '-',
    backgroundColor: '#666666',
    canvasBackgroundColor: '#ffffff',
    density: 0.3,
    spacing: 0,
    animationSpeed: 12,
    trail: false,
    preprocessing: {
      blur: 0,
      grain: 5,
      gamma: 1.0,
      blackPoint: 30,
      whitePoint: 255,
      threshold: 180,
      showEffect: true,
      dithering: false,
      ditheringStrength: 50,
      invert: false,
    },
    useBrightnessMapping: true,
    brightnessLevels: DEFAULT_BRIGHTNESS_LEVELS,
    // GIF Export settings
    gifExportQuality: 10, // 1-30: lower = better quality, larger file
    gifExportScale: 1.0, // 0.25-1.0: export scale
    // Import settings
    importResolution: 150, // 50-300: grid resolution
    // Image transform settings
    imageScale: 1.0, // 0.1-3.0: scale of imported image
    imageOffsetX: 0, // -100 to 100: horizontal offset (%)
    imageOffsetY: 0, // -100 to 100: vertical offset (%)
    // GIF loop settings
    loopMode: 'normal', // 'normal' | 'pingpong'
  });

  const [playing, setPlaying] = React.useState(true);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingProgress, setRecordingProgress] = React.useState(0);
  const [recordingType, setRecordingType] = React.useState<'gif' | 'webm'>('gif');
  const [uploadedImageBase64, setUploadedImageBase64] = React.useState<string | null>(null);
  const [isUploadedGif, setIsUploadedGif] = React.useState<boolean>(false);

  const handleImageUpload = async (file: File) => {
    console.log('📤 Starting image upload:', file.name, file.type, `${(file.size / 1024 / 1024).toFixed(2)}MB`);

    try {
      // Check file size (warn if > 3MB for GIF, 5MB for static)
      const fileSizeMB = file.size / (1024 * 1024);
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const maxSize = isGif ? 3 : 5;

      if (fileSizeMB > maxSize) {
        const confirmUpload = confirm(
          `⚠️ 파일 크기가 ${fileSizeMB.toFixed(1)}MB입니다.\n` +
          `${isGif ? 'GIF는 3MB 이하 권장' : '이미지는 5MB 이하 권장'}\n\n` +
          `큰 파일은 브라우저가 멈출 수 있습니다.\n계속하시겠습니까?`
        );
        if (!confirmUpload) {
          console.log('❌ Upload cancelled by user');
          return;
        }
      }

      // Use configurable resolution for image processing (independent of cellSize)
      // This ensures consistent quality regardless of display settings
      const resolution = config.importResolution ?? 150; // User-configurable grid resolution
      const aspectRatio = config.width / config.height;

      let cols, rows;
      if (aspectRatio > 1) {
        // Wider than tall
        cols = resolution;
        rows = Math.floor(resolution / aspectRatio);
      } else {
        // Taller than wide or square
        rows = resolution;
        cols = Math.floor(resolution * aspectRatio);
      }

      console.log(`📐 Internal image resolution: ${cols}x${rows} (resolution: ${resolution})`);
      console.log(`📺 Display grid size: ${Math.floor(config.width / config.cellSize)}x${Math.floor(config.height / config.cellSize)} (cellSize: ${config.cellSize})`);
      setIsUploadedGif(isGif);

      // Convert file to base64 for export
      console.log('🔄 Converting to base64...');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadedImageBase64(base64);
      console.log(`✅ Base64 saved (${Math.round(base64.length / 1024)}KB)`);

      if (isGif) {
        console.log('🎬 Starting GIF parsing...');
        try {
          // Show loading indicator
          const startTime = Date.now();

          // Load GIF frames with timeout
          const gifPromise = loadGifForAscii(file, cols, rows);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('GIF parsing timeout (30s)')), 30000)
          );

          const { frames, delay } = await Promise.race([gifPromise, timeoutPromise]) as Awaited<ReturnType<typeof loadGifForAscii>>;

          const loadTime = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`✅ GIF loaded: ${frames.length} frames in ${loadTime}s`);

          setConfig((prev) => ({
            ...prev,
            imageData: frames[0],
            imageFrames: frames,
            gifFrameDelay: delay,
          }));
        } catch (gifError) {
          console.error('❌ GIF parsing failed:', gifError);
          alert(`GIF 로드 실패: ${gifError instanceof Error ? gifError.message : '알 수 없는 오류'}\n\n정적 이미지로 로드합니다.`);

          // Fallback to static image
          console.log('🔄 Loading as static image...');
          const imageData = await loadImageForAscii(file, cols, rows);
          setConfig((prev) => ({
            ...prev,
            imageData,
            imageFrames: undefined,
            gifFrameDelay: undefined,
          }));
          console.log('✅ Static image loaded');
        }
      } else {
        console.log('🖼️ Loading static image...');
        const imageData = await loadImageForAscii(file, cols, rows);
        setConfig((prev) => ({
          ...prev,
          imageData,
          imageFrames: undefined,
          gifFrameDelay: undefined,
        }));
        console.log('✅ Static image loaded');
      }
    } catch (error) {
      console.error('❌ Critical error during upload:', error);
      alert(`이미지 로드 실패:\n${error instanceof Error ? error.message : '알 수 없는 오류'}\n\n콘솔을 확인하세요.`);
    }
  };

  const handleExportFrame = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'flying-particles.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleRecordWebM = async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
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
      link.download = `flying-particles-${Date.now()}.webm`;
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
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas || isRecording) return;

    setIsRecording(true);
    setRecordingProgress(0);

    // GIF settings
    // Calculate duration: use GIF length if available, otherwise 3 seconds
    const duration = config.imageFrames && config.imageFrames.length > 1
      ? (config.imageFrames.length / config.animationSpeed) * 1000
      : 3000;
    const fps = Math.min(config.animationSpeed, 20); // Cap at 20fps for reasonable file size
    const totalFrames = Math.floor((duration / 1000) * fps);
    const frameInterval = 1000 / fps;

    // Apply export scale
    const scale = config.gifExportScale ?? 1.0;
    const exportWidth = Math.floor(canvas.width * scale);
    const exportHeight = Math.floor(canvas.height * scale);

    const gif = new GIF({
      workers: 2,
      quality: config.gifExportQuality ?? 10,
      workerScript: '/gif.worker.js',
      width: exportWidth,
      height: exportHeight,
    });

    let frameCount = 0;

    // Capture frames
    const captureFrame = () => {
      if (frameCount >= totalFrames) {
        // Rendering finished, now render GIF
        gif.on('finished', (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `flying-particles-${Date.now()}.gif`;
          link.click();
          URL.revokeObjectURL(url);
          setIsRecording(false);
          setRecordingProgress(0);
        });

        gif.on('progress', (progress: number) => {
          setRecordingProgress(Math.round(progress * 100));
        });

        gif.render();
        return;
      }

      // Add frame to GIF (with scaling if needed)
      if (scale < 1) {
        // Create scaled canvas for smaller export
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = exportWidth;
        scaledCanvas.height = exportHeight;
        const scaledCtx = scaledCanvas.getContext('2d');
        if (scaledCtx) {
          scaledCtx.drawImage(canvas, 0, 0, exportWidth, exportHeight);
          gif.addFrame(scaledCanvas, { copy: true, delay: frameInterval });
        }
      } else {
        gif.addFrame(canvas, { copy: true, delay: frameInterval });
      }
      frameCount++;
      setRecordingProgress(Math.round((frameCount / totalFrames) * 50)); // First 50% is capturing

      setTimeout(captureFrame, frameInterval);
    };

    // Start capturing
    setTimeout(captureFrame, frameInterval);
  };

  const handleRecord = () => {
    if (recordingType === 'gif') {
      handleRecordGif();
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

interface FlyingBugsAnimationProps {
  config?: Partial<AsciiConfig>;
  imageUrl?: string;
  isGif?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_CONFIG: AsciiConfig = ${configJSON};

export default function FlyingBugsAnimation({
  config: customConfig,
  imageUrl = ${imageFileName ? `'/${imageFileName}'` : 'null'},
  isGif = ${isGif},
  className,
  style,
}: FlyingBugsAnimationProps) {
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

    let particles: any[] = [];
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

        particles = initializeParticles(config);
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

        particles = updateParticles(particles, config);
        const frame = generateFrame(particles, config);
        drawFrame(ctx!, frame, config, particles);
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

    // Prepare image data - use file reference for static images, embedded for GIF
    const imageFileName = uploadedImageBase64 ? (isUploadedGif ? 'animation.gif' : 'animation.png') : null;
    const isGif = isUploadedGif;
    const hasPreprocessedFrames = preprocessedFrames !== null && preprocessedFrames.frames.length > 0;

    // Create standalone HTML file
    // If GIF, embed preprocessed brightness maps for offline playback
    // If static image, use file reference (simpler case)
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
    // null for static images or no image
    const preprocessedFrames = ${hasPreprocessedFrames ? JSON.stringify(preprocessedFrames) : 'null'};

    // Image file reference (for static images only)
    const imageFileName = ${!hasPreprocessedFrames && imageFileName ? `'${imageFileName}'` : 'null'};
    const isGif = ${isGif};

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

    // Load single image from file (for static images only)
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

    let particles = initializeParticles(config);
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
        } else if (imageFileName) {
          // Load static image from file
          staticImageData = await loadImageData(imageFileName);
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

        // Update particles
        particles = updateParticles(particles, config);

        // Generate and draw frame
        const frame = generateFrameWithBrightness(particles, config, currentBrightnessMap, currentImageData);
        drawFrame(ctx, frame, config, particles);
      }

      requestAnimationFrame(animate);
    }
  </script>
</body>
</html>`;

    // Create server startup scripts
    const startServerSh = `#!/bin/bash
echo "🚀 Starting local server at http://localhost:8000"
echo "📂 Serving files from: $(pwd)"
echo ""
echo "✨ Open http://localhost:8000 in your browser"
echo "⏹️  Press Ctrl+C to stop"
echo ""

# Check if python3 is available
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
else
    echo "❌ Python not found. Please install Python 3."
    echo "   Visit: https://www.python.org/downloads/"
    exit 1
fi`;

    const startServerBat = `@echo off
echo.
echo ========================================
echo   ASCII Art Animation - Local Server
echo ========================================
echo.
echo Starting local server at http://localhost:8000
echo Serving files from: %cd%
echo.
echo Open http://localhost:8000 in your browser
echo Press Ctrl+C to stop
echo.
echo ========================================
echo.

REM Check if python is available
python --version >nul 2>&1
if %errorlevel% == 0 (
    python -m http.server 8000
) else (
    echo Python not found. Please install Python 3.
    echo Visit: https://www.python.org/downloads/
    pause
    exit /b 1
)`;

    // Create React component file
    const reactComponentContent = generateReactComponent(imageFileName, isGif, configJSON);

    // Create README (simplified version ~50 lines)
    const readmeContent = `# ASCII Art Animation

## React/Next.js

1. \`FlyingBugsAnimation.tsx\` → \`components/\`
${imageFileName ? `2. \`${imageFileName}\` → \`public/\`\n` : ''}
3. 사용:

\`\`\`tsx
import FlyingBugsAnimation from '@/components/FlyingBugsAnimation';

export default function Page() {
  return <FlyingBugsAnimation />;
}
\`\`\`

## HTML (테스트)

${hasPreprocessedFrames ? `**✅ GIF 프레임이 HTML에 임베드되어 있어 file:// 프로토콜로 바로 열 수 있습니다!**

\`index.html\`을 더블클릭하면 바로 실행됩니다.
` : `1. \`./start-server.sh\` 또는 \`start-server.bat\` 실행
2. http://localhost:8000 열기
`}
## 커스터마이징

config.json의 설정값을 props로 전달:

\`\`\`tsx
<FlyingBugsAnimation
  config={{
    fontSize: 12,
    animationSpeed: 20,
  }}
/>
\`\`\`

## 주요 설정값

| 설정 | 설명 |
|------|------|
| particleCount | 벌레 개수 |
| particleSpeed | 이동 속도 |
| fontSize | 배경 문자 크기 |
| cellSize | 그리드 셀 크기 |
| animationSpeed | FPS |

${isUploadedGif ? `
## GIF 정보

${hasPreprocessedFrames ? '- GIF 프레임이 brightness map으로 사전 처리되어 HTML에 임베드됨\n- 오프라인에서도 작동\n- file:// 프로토콜 지원' : '- React 컴포넌트: gifuct-js가 CDN에서 자동 로드됨\n- GIF 파일을 public/ 폴더에 넣어야 함'}
` : ''}
---
Made with 🎨 by I Hate ASCII Art Generator
`;

    // Add files to ZIP
    zip.file('index.html', htmlContent);
    zip.file('FlyingBugsAnimation.tsx', reactComponentContent);
    zip.file('config.json', configJSON);
    zip.file('README.md', readmeContent);
    zip.file('start-server.sh', startServerSh);
    zip.file('start-server.bat', startServerBat);

    // Add image/GIF file if present
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
    saveAs(blob, `flying-particles-animation-${Date.now()}.zip`);
  };

  const generateInlineEngine = () => {
    return `
    // ============================================
    // Bug initialization and movement
    // ============================================
    function initializeParticles(config) {
      const particles = [];
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);

      for (let i = 0; i < config.particleCount; i++) {
        particles.push({
          id: i,
          x: Math.random() * cols,
          y: Math.random() * rows,
          vx: (Math.random() - 0.5) * config.particleSpeed,
          vy: (Math.random() - 0.5) * config.particleSpeed,
          char: config.particleChars[Math.floor(Math.random() * config.particleChars.length)],
          color: config.particleColors[Math.floor(Math.random() * config.particleColors.length)],
        });
      }
      return particles;
    }

    function updateParticles(particles, config) {
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);
      const morphChance = (config.particleMorphSpeed || 50) / 100 * 0.1;

      return particles.map((particle, index) => {
        let newVx = particle.vx;
        let newVy = particle.vy;

        // Apply separation force to prevent clustering
        let separationX = 0;
        let separationY = 0;
        const separationRadius = Math.max(cols, rows) * 0.1;

        particles.forEach((otherParticle, otherIndex) => {
          if (index === otherIndex) return;

          const dx = particle.x - otherBug.x;
          const dy = particle.y - otherBug.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < separationRadius && distance > 0) {
            const force = (separationRadius - distance) / separationRadius;
            separationX += (dx / distance) * force * 0.1;
            separationY += (dy / distance) * force * 0.1;
          }
        });

        newVx += separationX;
        newVy += separationY;

        if (Math.random() < 0.05) {
          newVx += (Math.random() - 0.5) * config.particleSpeed * 0.3;
          newVy += (Math.random() - 0.5) * config.particleSpeed * 0.3;
        }

        const speed = Math.sqrt(newVx * newVx + newVy * newVy);
        const maxSpeed = config.particleSpeed * 1.5;
        if (speed > maxSpeed) {
          newVx = (newVx / speed) * maxSpeed;
          newVy = (newVy / speed) * maxSpeed;
        }

        let newX = particle.x + newVx;
        let newY = particle.y + newVy;

        if (newX < 0 || newX >= cols) {
          newVx = -newVx;
          newX = Math.max(0, Math.min(cols - 1, newX));
        }
        if (newY < 0 || newY >= rows) {
          newVy = -newVy;
          newY = Math.max(0, Math.min(rows - 1, newY));
        }

        let newChar = particle.char;
        if (Math.random() < morphChance) {
          newChar = config.particleChars[Math.floor(Math.random() * config.particleChars.length)];
        }

        return { ...particle, x: newX, y: newY, vx: newVx, vy: newVy, char: newChar };
      });
    }

    // ============================================
    // Brightness-based character selection
    // (matches ascii-engine.ts selectCharByBrightness)
    // ============================================
    function selectCharByBrightness(brightness, levels, fallbackChar) {
      const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);
      for (const level of sorted) {
        if (brightness <= level.threshold) {
          return level.char;
        }
      }
      return fallbackChar;
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
    function generateFrameWithBrightness(particles, config, precomputedBrightnessMap, imageData) {
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
      for (let row = 0; row < rows; row++) {
        grid[row] = [];
        colors[row] = [];
        for (let col = 0; col < cols; col++) {
          let char = ' ';

          if (brightnessMap && brightnessMap[row]) {
            const brightness = brightnessMap[row][col];

            if (config.useBrightnessMapping && config.brightnessLevels && config.brightnessLevels.length > 0) {
              // Use brightness mapping
              if (brightness < config.preprocessing.threshold) {
                char = selectCharByBrightness(brightness, config.brightnessLevels, config.backgroundChar);
              }
            } else {
              // Simple threshold
              const shouldDraw = brightness < config.preprocessing.threshold;
              char = shouldDraw ? config.backgroundChar : ' ';
            }
          } else {
            // No image - use density pattern
            const hash = (row * 2654435761 + col * 2246822519) >>> 0;
            const pseudoRandom = (hash % 1000) / 1000;
            const shouldDraw = pseudoRandom < config.density;
            char = shouldDraw ? config.backgroundChar : ' ';
          }

          grid[row][col] = char;
          colors[row][col] = config.backgroundColor;
        }
      }

      return { grid, colors };
    }

    // ============================================
    // Legacy generateFrame wrapper for React component
    // (React component uses config.imageData)
    // ============================================
    function generateFrame(particles, config) {
      return generateFrameWithBrightness(particles, config, null, config.imageData);
    }

    // ============================================
    // Draw frame to canvas
    // (matches AsciiCanvas.tsx drawFrame exactly)
    // ============================================
    function drawFrame(ctx, frame, config, particles) {
      const cols = Math.floor(config.width / config.cellSize);
      const rows = Math.floor(config.height / config.cellSize);
      const actualCellSize = config.cellSize + (config.spacing || 0);

      // Use explicit font sizes from config
      const backgroundFontSize = config.fontSize;
      // No longer using separate particle font size

      // Clear canvas
      ctx.fillStyle = config.canvasBackgroundColor || '#000000';
      ctx.fillRect(0, 0, config.width, config.height);

      // Draw background pattern
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

      // Draw particles on top with their own font size
      ctx.font = calculatedFontSize + 'px monospace';
      particles.forEach(particle => {
        const col = Math.floor(particle.x);
        const row = Math.floor(particle.y);

        if (row >= 0 && row < rows && col >= 0 && col < cols) {
          const x = col * actualCellSize + actualCellSize / 2;
          const y = row * actualCellSize + actualCellSize / 2;

          ctx.fillStyle = particle.color;
          ctx.fillText(particle.char, x, y);
        }
      });
    }
    `;
  };

  return (
    <div className="min-h-screen p-8 bg-black">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 font-mono">
                🎨 ASCII Art Animator
              </h1>
              <p className="text-white/60 font-mono text-sm">
                ASCII 스타일 벌레 애니메이션 생성기
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-mono text-sm transition-colors"
            >
              ← Halftone Animator
            </Link>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Canvas */}
          <div className="lg:col-span-2">
            <div className="aspect-square w-full mb-4">
              <AsciiCanvas config={config} playing={playing} />
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <div className="flex gap-4">
                <button
                  onClick={() => setPlaying(!playing)}
                  className={`px-6 py-3 rounded-lg font-mono font-medium transition-colors ${
                    playing
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {playing ? '⏸ Pause' : '▶ Resume'}
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleExportFrame}
                  disabled={isRecording}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg font-mono font-medium transition-colors"
                >
                  ↓ Export PNG
                </button>
                <button
                  onClick={handleExportCode}
                  disabled={isRecording}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-900 text-white rounded-lg font-mono font-medium transition-colors"
                  title="현재 설정으로 웹사이트에 사용할 수 있는 코드 export"
                >
                  📦 Export Code
                </button>
              </div>

              {/* Animation Export */}
              <div className="flex gap-3 items-center">
                <button
                  onClick={handleRecord}
                  disabled={isRecording}
                  className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white rounded-lg font-mono font-medium transition-colors"
                >
                  {isRecording ? (
                    <>
                      🎬 Recording... {recordingProgress}%
                    </>
                  ) : (
                    (() => {
                      const duration = config.imageFrames && config.imageFrames.length > 1
                        ? (config.imageFrames.length / config.animationSpeed).toFixed(1)
                        : '3';
                      return `🎬 Record ${recordingType.toUpperCase()} (${duration}s)`;
                    })()
                  )}
                </button>
                <select
                  value={recordingType}
                  onChange={(e) => setRecordingType(e.target.value as 'gif' | 'webm')}
                  disabled={isRecording}
                  className="px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white font-mono text-sm disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <option value="gif" style={{ backgroundColor: '#1a1a1a' }}>GIF</option>
                  <option value="webm" style={{ backgroundColor: '#1a1a1a' }}>WebM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Control Panel */}
          <div className="lg:col-span-1">
            <AsciiControlPanel
              config={config}
              onChange={setConfig}
              onImageUpload={handleImageUpload}
            />
          </div>
        </div>

        {/* Presets */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-white mb-4 font-mono">프리셋</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <button
              onClick={() =>
                setConfig({
                  ...config,
                  backgroundChar: '-',
                  backgroundColor: '#333333',
                  canvasBackgroundColor: '#ffffff',
                  density: 0.3,
                  spacing: -5,
                  cellSize: 15,
                  animationSpeed: 12,
                  useBrightnessMapping: true,
                  brightnessLevels: DEFAULT_BRIGHTNESS_LEVELS,
                  preprocessing: {
                    blur: 0,
                    grain: 5,
                    gamma: 1.0,
                    blackPoint: 30,
                    whitePoint: 255,
                    threshold: 180,
                    showEffect: true,
                    dithering: true,
                    ditheringStrength: 60,
                    invert: false,
                  },
                })
              }
              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-left transition-colors"
            >
              <div className="font-semibold text-white mb-1 font-mono">🔥 Rich Detail</div>
              <div className="text-sm text-white/60 font-mono">디테일 보존, 디더링, 부드러운 명암</div>
            </button>

            <button
              onClick={() =>
                setConfig({
                  ...config,
                  backgroundChar: '∙',
                  backgroundColor: '#003300',
                  canvasBackgroundColor: '#000000',
                  density: 0.5,
                  spacing: 0,
                  cellSize: 10,
                  animationSpeed: 45,
                  useBrightnessMapping: false,
                  brightnessLevels: DEFAULT_BRIGHTNESS_LEVELS,
                  preprocessing: {
                    blur: 3,
                    grain: 10,
                    gamma: 1.0,
                    blackPoint: 50,
                    whitePoint: 200,
                    threshold: 128,
                    showEffect: true,
                    dithering: false,
                    ditheringStrength: 50,
                    invert: false,
                  },
                })
              }
              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-left transition-colors"
            >
              <div className="font-semibold text-white mb-1 font-mono">⚡ Matrix Fast</div>
              <div className="text-sm text-white/60 font-mono">빠르고 많은 벌레들, 기본 간격</div>
            </button>

            <button
              onClick={() =>
                setConfig({
                  ...config,
                  backgroundChar: '≡',
                  backgroundColor: '#663366',
                  canvasBackgroundColor: '#000000',
                  density: 0.2,
                  spacing: 5,
                  cellSize: 16,
                  animationSpeed: 20,
                  useBrightnessMapping: false,
                  brightnessLevels: DEFAULT_BRIGHTNESS_LEVELS,
                  preprocessing: {
                    blur: 10,
                    grain: 5,
                    gamma: 1.5,
                    blackPoint: 150,
                    whitePoint: 250,
                    threshold: 180,
                    showEffect: true,
                    dithering: false,
                    ditheringStrength: 50,
                    invert: false,
                  },
                })
              }
              className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-left transition-colors"
            >
              <div className="font-semibold text-white mb-1 font-mono">💎 Simple Style</div>
              <div className="text-sm text-white/60 font-mono">넓은 간격, 미니멀 스타일</div>
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 p-6 bg-white/5 rounded-lg border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3 font-mono">사용 방법</h3>
          <ol className="space-y-2 text-white/70 text-sm font-mono list-decimal list-inside">
            <li>설정을 변경하면 실시간으로 화면에 반영됩니다 (자동 업데이트)</li>
            <li>Canvas Size로 캔버스 크기를 설정하세요</li>
            <li>
              크기 조절:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>Cell Size: 그리드 간격 (작을수록 촘촘함)</li>
                <li>Font Size: 배경 문자 크기</li>
                <li className="text-yellow-400/80">
                  <strong>Bug Font Size</strong>: 벌레 문자 크기 (배경보다 크게 설정하면 잘 보임!)
                </li>
              </ul>
            </li>
            <li>Bug Count로 날아다니는 벌레 개수를 설정하세요</li>
            <li>Bug Speed로 벌레들의 이동 속도를 조절하세요</li>
            <li>
              Bug Morph Speed로 벌레 모양 변화 속도를 조절하세요
              <br />→ 0: 변화 없음, 50: 보통, 100: 빠르게 변화 (*❊※ 같은 다양한 모양으로!)
            </li>
            <li>FPS로 애니메이션 프레임 속도를 설정하세요</li>
            <li>
              색상 설정:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>Canvas Background Color: 전체 배경색 (컬러 피커로 선택)</li>
                <li>Pattern Background Color: 배경 문자 색상</li>
                <li>Bug Colors: 벌레 색상 (최대 4개 컬러 피커 + 추가 입력 가능)</li>
              </ul>
            </li>
            <li>
              [★] Use Brightness Mapping:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>ON: 명암값에 따라 다른 문자 사용 (풍부한 표현)</li>
                <li>Brightness Levels 편집: 단계별 threshold, 문자, 이름 변경 가능</li>
                <li>+ Add Level: 새로운 명암 단계 추가</li>
                <li>✕ 버튼: 해당 단계 삭제</li>
                <li>Reset to Default: 기본 8단계로 복원</li>
                <li>OFF: 단일 배경 문자 사용 (빠른 렌더링)</li>
              </ul>
            </li>
            <li>
              Pattern Spacing으로 문자 사이 간격 조절:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>패턴 개수는 유지, 문자 사이의 물리적 간격만 조절</li>
                <li>-10 ~ -1: 간격 좁힘 (문자들이 서로 가까워짐)</li>
                <li>0: 기본 간격 (cellSize 그대로)</li>
                <li>+1 ~ +10: 간격 넓힘 (문자들이 서로 멀어짐)</li>
                <li>Actual cell size = cellSize + spacing</li>
              </ul>
            </li>
            <li>Grid Density로 배경 패턴 밀도를 조절하세요 (이미지 없을 때만)</li>
            <li>Bug Characters에서 벌레 모양을 선택하세요 (다중 선택 가능)</li>
            <li>
              이미지/GIF 업로드:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>정적 이미지: 밝기 기반 배경 패턴 생성</li>
                <li className="text-green-400/80">
                  <strong>🎬 움직이는 GIF</strong>: 실시간 ASCII 애니메이션 변환!
                  <br />→ GIF의 각 프레임이 자동으로 ASCII로 변환되어 재생됩니다
                </li>
              </ul>
            </li>
            <li>
              Image Preprocessing으로 이미지 전처리:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>[★] Show Effect: 전처리 효과 적용 토글</li>
                <li>
                  <strong>Blur</strong>: 이미지 흐림 효과 (↑ 높을수록 디테일 손실)
                  <br />→ 디테일 보존하려면 0-2 권장
                </li>
                <li>
                  <strong>Grain</strong>: 필름 노이즈 효과 (↑ 높을수록 거친 질감)
                  <br />→ 디테일 보존하려면 0-10 권장
                </li>
                <li>
                  <strong>Gamma</strong>: 중간톤 밝기 조절 (&lt;1: 어둡게, =1: 원본, &gt;1: 밝게)
                  <br />→ 디테일 보존하려면 0.8-1.2 권장
                </li>
                <li>
                  <strong>Black Point</strong>: 어두운 영역 임계값 (↓ 낮을수록 어두운 부분 살림)
                  <br />→ 디테일 보존하려면 0-50 권장
                </li>
                <li>
                  <strong>White Point</strong>: 밝은 영역 임계값 (↑ 높을수록 밝은 부분 살림)
                  <br />→ 디테일 보존하려면 200-255 권장
                </li>
                <li>
                  <strong>Threshold</strong>: 패턴 생성 임계값 (↓ 낮을수록 패턴 많음)
                  <br />→ 이미지에 따라 150-200 조절
                </li>
                <li>
                  <strong>Dithering</strong>: 부드러운 명암 전환 (Floyd-Steinberg 알고리즘)
                  <br />→ 명암이 계단처럼 보일 때 활성화 (강도: 50-70 권장)
                </li>
                <li className="text-yellow-400/80">
                  💡 <strong>디테일이 뭉개질 때:</strong> Blur=0, Grain=5, Gamma=1.0, BlackPoint=30, WhitePoint=255, Dithering=ON
                </li>
                <li className="text-green-400/80">
                  ✨ <strong>부드러운 명암을 원할 때:</strong> Dithering을 활성화하고 강도를 60-70으로 설정
                </li>
              </ul>
            </li>
            <li>⏸ Pause 버튼으로 벌레 움직임을 일시정지할 수 있습니다</li>
            <li>
              Export 기능:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>↓ Export PNG: 현재 프레임을 이미지로 저장</li>
                <li className="text-cyan-400/80">
                  <strong>📦 Export Code:</strong> 웹사이트에 바로 사용할 수 있는 코드 다운로드!
                  <ul className="ml-6 mt-1 space-y-1">
                    <li>ZIP 파일로 다운로드 (index.html + config.json + README)</li>
                    <li>index.html을 바로 브라우저에서 열면 실행됨</li>
                    <li>자신의 웹사이트에 통합 가능</li>
                    <li>현재 설정값이 모두 포함됨</li>
                  </ul>
                </li>
                <li>
                  🎬 Record Animation: 애니메이션 녹화
                  <ul className="ml-6 mt-1 space-y-1">
                    <li className="text-green-400/80">
                      <strong>GIF 업로드 시:</strong> 원본 GIF 길이만큼 자동 녹화!
                    </li>
                    <li>정적 이미지: 3초 녹화 (기본)</li>
                    <li>GIF: 범용성 높음, 모든 사이트 지원, 파일 크기 큼</li>
                    <li>WebM: 고품질, 작은 파일 크기, 웹 최적화 (HTML5 video)</li>
                  </ul>
                </li>
              </ul>
            </li>
          </ol>
        </div>

        {/* Credits */}
        <div className="mt-8 text-center text-white/40 font-mono text-sm">
          <p>Made with hate for flying particles 🎨</p>
          <p className="mt-1">ihateflyingparticles.com</p>
        </div>
      </div>
    </div>
  );
}
