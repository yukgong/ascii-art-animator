'use client';

import React from 'react';
import {
  generateFrame,
  preprocessImage,
  type AsciiConfig,
} from '@/lib/animations/ascii-engine';

interface AsciiCanvasProps {
  config: AsciiConfig;
  playing: boolean;
}

export default function AsciiCanvas({ config, playing }: AsciiCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const animationFrameRef = React.useRef<number | undefined>(undefined);
  const lastFrameTimeRef = React.useRef<number>(0);
  const lastGifFrameTimeRef = React.useRef<number>(0);
  const gifFrameIndexRef = React.useRef<number>(0);
  const gifFrameDirectionRef = React.useRef<1 | -1>(1); // For pingpong mode
  const configRef = React.useRef(config);
  const processedImageCacheRef = React.useRef<{
    key: string;
    data: ImageData;
  } | null>(null);

  // Keep config ref updated for animation loop
  React.useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Cache preprocessed image to avoid reprocessing every frame
  const getProcessedImage = React.useCallback((cfg: AsciiConfig): ImageData | undefined => {
    if (!cfg.imageData) return undefined;
    if (!cfg.preprocessing.showEffect) return cfg.imageData;

    // Create cache key from preprocessing settings
    const cacheKey = JSON.stringify({
      blur: cfg.preprocessing.blur,
      grain: cfg.preprocessing.grain,
      gamma: cfg.preprocessing.gamma,
      blackPoint: cfg.preprocessing.blackPoint,
      whitePoint: cfg.preprocessing.whitePoint,
      width: cfg.imageData.width,
      height: cfg.imageData.height,
    });

    // Return cached result if key matches
    if (processedImageCacheRef.current && processedImageCacheRef.current.key === cacheKey) {
      return processedImageCacheRef.current.data;
    }

    // Process and cache
    const processed = preprocessImage(cfg.imageData, cfg.preprocessing);
    processedImageCacheRef.current = { key: cacheKey, data: processed };
    return processed;
  }, []);

  // Clear cache when image changes
  React.useEffect(() => {
    processedImageCacheRef.current = null;
  }, [config.imageData]);


  // Draw single frame (for when not animating)
  const drawFrame = React.useCallback(
    (ctx: CanvasRenderingContext2D, cfg: AsciiConfig, gifFrameIndex?: number) => {
      const cols = Math.floor(cfg.width / cfg.cellSize);
      const rows = Math.floor(cfg.height / cfg.cellSize);

      // Get current image data (single image or GIF frame)
      let currentImageData = cfg.imageData;
      if (cfg.imageFrames && cfg.imageFrames.length > 0 && gifFrameIndex !== undefined) {
        currentImageData = cfg.imageFrames[gifFrameIndex % cfg.imageFrames.length];
      }

      // Validate image data before preprocessing
      let processedImage = undefined;
      if (currentImageData && currentImageData.width > 0 && currentImageData.height > 0) {
        processedImage = cfg.preprocessing.showEffect
          ? preprocessImage(currentImageData, cfg.preprocessing)
          : currentImageData;
      }

      const configWithProcessedImage: AsciiConfig = {
        ...cfg,
        imageData: processedImage,
        preprocessing: {
          ...cfg.preprocessing,
          showEffect: false, // Already processed, don't process again
        },
      };

      // Generate frame
      const frame = generateFrame(configWithProcessedImage);

      // Clear canvas with configured background color
      ctx.fillStyle = cfg.canvasBackgroundColor || '#000000';
      ctx.fillRect(0, 0, cfg.width, cfg.height);

      // Calculate actual spacing between characters
      // spacing: -10 (tighter) to 0 (normal) to +10 (wider)
      const actualCellSize = cfg.cellSize + cfg.spacing;

      // Calculate font sizes
      const backgroundFontSize = cfg.fontSize ?? cfg.cellSize * 0.8;

      // Draw background first
      ctx.font = `${backgroundFontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const char = frame.grid[row][col];
          if (char === ' ') continue;

          // Apply spacing to character position
          const x = col * actualCellSize + actualCellSize / 2;
          const y = row * actualCellSize + actualCellSize / 2;

          ctx.fillStyle = frame.colors[row][col];
          ctx.fillText(char, x, y);
        }
      }

    },
    [getProcessedImage]
  );

  // Draw static frame when config changes (and not playing)
  React.useEffect(() => {
    if (playing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawFrame(ctx, config, gifFrameIndexRef.current);
  }, [config, playing, drawFrame]);

  // Animation loop (always runs, updates GIF frames when playing)
  React.useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const animate = (timestamp: number) => {
      if (!isRunning) return;

      const currentConfig = configRef.current;
      const frameInterval = 1000 / currentConfig.animationSpeed;

      // Throttle to target FPS
      if (timestamp - lastFrameTimeRef.current < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      lastFrameTimeRef.current = timestamp;

      // Update GIF frame if applicable (advance every animation frame, ignore GIF delay)
      if (currentConfig.imageFrames && currentConfig.imageFrames.length > 1 && playing) {
        gifFrameIndexRef.current = (gifFrameIndexRef.current + 1) % currentConfig.imageFrames.length;
      }

      // Always draw the current frame (with GIF frame index)
      drawFrame(ctx, currentConfig, gifFrameIndexRef.current);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playing, drawFrame]);

  return (
    <div
      className="relative w-full h-full flex items-center justify-center rounded-none overflow-hidden"
      style={{ backgroundColor: config.canvasBackgroundColor || '#000000' }}
    >
      <canvas
        ref={canvasRef}
        width={config.width}
        height={config.height}
        className="max-w-full max-h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/80 px-6 py-3 rounded-none text-white/60 text-sm font-mono">
            ⏸ Paused
          </div>
        </div>
      )}
    </div>
  );
}
