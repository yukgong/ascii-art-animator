'use client';

import React from 'react';
import {
  generateFrame,
  preprocessImage,
  drawAsciiFrame,
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
  const animTickRef = React.useRef<number>(0);
  const configRef = React.useRef(config);
  const configVersionRef = React.useRef(0);
  const lastDrawnVersionRef = React.useRef(-1);

  React.useEffect(() => {
    configRef.current = config;
    configVersionRef.current += 1;
  }, [config]);


  const drawFrame = React.useCallback(
    (ctx: CanvasRenderingContext2D, cfg: AsciiConfig, gifFrameIndex: number = 0, animTick: number = 0) => {
      let currentImageData = cfg.imageData;
      if (cfg.imageFrames && cfg.imageFrames.length > 0) {
        currentImageData = cfg.imageFrames[gifFrameIndex % cfg.imageFrames.length];
      }

      let processedImage = undefined;
      if (currentImageData && currentImageData.width > 0 && currentImageData.height > 0) {
        processedImage = cfg.preprocessing.showEffect
          ? preprocessImage(currentImageData, cfg.preprocessing)
          : currentImageData;
      }

      const frame = generateFrame({
        ...cfg,
        imageData: processedImage,
        preprocessing: { ...cfg.preprocessing, showEffect: false },
      });

      drawAsciiFrame(ctx, frame, cfg, animTick);
    },
    []
  );

  // Single animation loop — sole owner of all canvas draws
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

      const configChanged = configVersionRef.current !== lastDrawnVersionRef.current;
      const intervalElapsed = timestamp - lastFrameTimeRef.current >= frameInterval;

      if (!configChanged && !intervalElapsed) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (intervalElapsed) {
        lastFrameTimeRef.current = timestamp;
        animTickRef.current += 1;

        if (currentConfig.imageFrames && currentConfig.imageFrames.length > 1 && playing) {
          gifFrameIndexRef.current = (gifFrameIndexRef.current + 1) % currentConfig.imageFrames.length;
        }
      }

      lastDrawnVersionRef.current = configVersionRef.current;
      drawFrame(ctx, currentConfig, gifFrameIndexRef.current, animTickRef.current);

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
        id="ascii-main-canvas"
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
