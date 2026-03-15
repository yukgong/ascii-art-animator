'use client';

import React from 'react';
import {
  DEFAULT_BRIGHTNESS_LEVELS,
  preprocessImage,
  type AsciiConfig,
  type BackgroundCharacter,
  type BrightnessLevel,
} from '@/lib/animations/ascii-engine';

interface AsciiControlPanelProps {
  config: AsciiConfig;
  onChange: (config: AsciiConfig) => void;
  onImageUpload: (file: File) => void;
}

export default function AsciiControlPanel({
  config,
  onChange,
  onImageUpload,
}: AsciiControlPanelProps) {
  // State for Image Transform accordion
  const [isImageTransformOpen, setIsImageTransformOpen] = React.useState(true);

  // Ensure preprocessing and brightness mapping exist with defaults
  const safeConfig = React.useMemo(
    () => ({
      ...config,
      preprocessing: config.preprocessing || {
        blur: 0,
        grain: 5,
        gamma: 1.0,
        blackPoint: 30,
        whitePoint: 255,
        threshold: 180,
        showEffect: true,
        dithering: false,
        ditheringStrength: 50,
      },
      useBrightnessMapping: config.useBrightnessMapping ?? true,
      brightnessLevels: config.brightnessLevels || DEFAULT_BRIGHTNESS_LEVELS,
      spacing: config.spacing ?? 0,
    }),
    [config]
  );

  // Immediate update for most settings (no debounce)
  // Use config instead of safeConfig to avoid stale values
  const updateConfig = React.useCallback(
    <K extends keyof AsciiConfig>(key: K, value: AsciiConfig[K]) => {
      onChange({ ...config, [key]: value });
    },
    [onChange, config]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const gifPreviewFrameRef = React.useRef<number>(0);
  const gifPreviewIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Update preview when preprocessing settings change
  React.useEffect(() => {
    if (!config.imageData || !previewCanvasRef.current || !originalCanvasRef.current) return;

    const updatePreview = () => {
      // Get current frame (for GIF) or single image
      let currentImageData = config.imageData!;
      if (config.imageFrames && config.imageFrames.length > 0) {
        currentImageData = config.imageFrames[gifPreviewFrameRef.current % config.imageFrames.length];
      }

      // Validate image data dimensions
      if (!currentImageData || !currentImageData.width || !currentImageData.height ||
          currentImageData.width <= 0 || currentImageData.height <= 0) {
        console.warn('Invalid image data for preview:', currentImageData);
        return;
      }

      // Draw original image
      const originalCanvas = originalCanvasRef.current!;
      const originalCtx = originalCanvas.getContext('2d');
      if (originalCtx) {
        originalCanvas.width = currentImageData.width;
        originalCanvas.height = currentImageData.height;
        originalCtx.putImageData(currentImageData, 0, 0);
      }

      // Draw preprocessed image
      const previewCanvas = previewCanvasRef.current!;
      const previewCtx = previewCanvas.getContext('2d');
      if (previewCtx) {
        previewCanvas.width = currentImageData.width;
        previewCanvas.height = currentImageData.height;

        if (config.preprocessing.showEffect) {
          const processed = preprocessImage(currentImageData, config.preprocessing);
          previewCtx.putImageData(processed, 0, 0);
        } else {
          previewCtx.putImageData(currentImageData, 0, 0);
        }
      }
    };

    updatePreview();

    // Setup GIF animation for preview
    if (config.imageFrames && config.imageFrames.length > 1) {
      const delay = config.gifFrameDelay || 100;
      gifPreviewIntervalRef.current = setInterval(() => {
        gifPreviewFrameRef.current = (gifPreviewFrameRef.current + 1) % config.imageFrames!.length;
        updatePreview();
      }, delay);
    } else {
      if (gifPreviewIntervalRef.current) {
        clearInterval(gifPreviewIntervalRef.current);
        gifPreviewIntervalRef.current = null;
      }
      gifPreviewFrameRef.current = 0;
    }

    return () => {
      if (gifPreviewIntervalRef.current) {
        clearInterval(gifPreviewIntervalRef.current);
      }
    };
  }, [config.imageData, config.imageFrames, config.gifFrameDelay, config.preprocessing]);

  return (
    <div className="space-y-6 p-6 bg-white/5 rounded-lg border border-white/10 overflow-y-auto max-h-[calc(100vh-200px)]">

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Upload Media
        </label>
        <p className="text-xs text-white/50 mb-2">
          이미지를 업로드하면 밝기에 따라 배경 패턴이 생성됩니다
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-white/60
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-red-600 file:text-white
            hover:file:bg-red-700
            cursor-pointer font-mono"
        />
      </div>

      {/* Import Resolution */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
          Import Resolution: {config.importResolution ?? 150}
        </label>
        <p className="text-xs text-white/40 mb-2">
          이미지 임포트 해상도 (높을수록 디테일 ↑, 성능 ↓)
        </p>
        <input
          type="range"
          value={config.importResolution ?? 150}
          onChange={(e) => updateConfig('importResolution', parseInt(e.target.value))}
          min={50}
          max={300}
          step={10}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-white/30 mt-1">
          <span>50 (Fast)</span>
          <span>150 (Default)</span>
          <span>300 (Detailed)</span>
        </div>
        <p className="text-xs text-yellow-400/70 mt-2">
          💡 값 변경 후 이미지를 다시 업로드하세요
        </p>
      </div>

      {/* Image Transform Settings - only show when image is loaded */}
      {safeConfig.imageData && (
        <div className="border-t border-white/10 pt-4 space-y-4">
          <button
            onClick={() => setIsImageTransformOpen(!isImageTransformOpen)}
            className="w-full flex items-center justify-between text-md font-semibold text-white font-mono hover:text-white/80 transition-colors"
          >
            <span>Image Transform</span>
            <span className="text-xs">{isImageTransformOpen ? '▼' : '▶'}</span>
          </button>

          {isImageTransformOpen && (
            <>
              <p className="text-xs text-white/50">
                임포트한 이미지의 크기와 위치를 조정합니다
              </p>

          {/* Image Scale */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Scale: {((config.imageScale ?? 1.0) * 100).toFixed(0)}%
            </label>
            <p className="text-xs text-white/40 mb-2">
              이미지 크기 (100% = 캔버스에 맞춤)
            </p>
            <input
              type="range"
              value={(config.imageScale ?? 1.0) * 100}
              onChange={(e) => updateConfig('imageScale', parseInt(e.target.value) / 100)}
              min={10}
              max={300}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>10% (Zoom Out)</span>
              <span>100%</span>
              <span>300% (Zoom In)</span>
            </div>
          </div>

          {/* Image Offset X */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Offset X: {config.imageOffsetX ?? 0}%
            </label>
            <p className="text-xs text-white/40 mb-2">
              가로 위치 (음수 = 왼쪽, 양수 = 오른쪽)
            </p>
            <input
              type="range"
              value={config.imageOffsetX ?? 0}
              onChange={(e) => updateConfig('imageOffsetX', parseInt(e.target.value))}
              min={-100}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>-100 (Left)</span>
              <span>0</span>
              <span>+100 (Right)</span>
            </div>
          </div>

          {/* Image Offset Y */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Offset Y: {config.imageOffsetY ?? 0}%
            </label>
            <p className="text-xs text-white/40 mb-2">
              세로 위치 (음수 = 위, 양수 = 아래)
            </p>
            <input
              type="range"
              value={config.imageOffsetY ?? 0}
              onChange={(e) => updateConfig('imageOffsetY', parseInt(e.target.value))}
              min={-100}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>-100 (Up)</span>
              <span>0</span>
              <span>+100 (Down)</span>
            </div>
          </div>

              {/* Reset Transform Button */}
              <button
                onClick={() => {
                  updateConfig('imageScale', 1.0);
                  updateConfig('imageOffsetX', 0);
                  updateConfig('imageOffsetY', 0);
                }}
                className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded font-mono transition-colors"
              >
                Reset Transform
              </button>
            </>
          )}
        </div>
      )}

      {/* GIF Export Settings */}
      <div className="border-t border-white/10 pt-4 space-y-4">
        <h3 className="text-md font-semibold text-white font-mono">GIF Export Settings</h3>

        {/* Export Quality */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
            Export Quality: {config.gifExportQuality ?? 10}
          </label>
          <p className="text-xs text-white/40 mb-2">
            GIF 품질 (낮을수록 품질 ↑ 용량 ↑)
          </p>
          <input
            type="range"
            value={config.gifExportQuality ?? 10}
            onChange={(e) => updateConfig('gifExportQuality', parseInt(e.target.value))}
            min={1}
            max={30}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>1 (Best Quality)</span>
            <span>10 (Default)</span>
            <span>30 (Small File)</span>
          </div>
        </div>

        {/* Export Scale */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
            Export Scale: {((config.gifExportScale ?? 1.0) * 100).toFixed(0)}%
          </label>
          <p className="text-xs text-white/40 mb-2">
            내보내기 크기 (작을수록 용량 ↓)
          </p>
          <input
            type="range"
            value={(config.gifExportScale ?? 1.0) * 100}
            onChange={(e) => updateConfig('gifExportScale', parseInt(e.target.value) / 100)}
            min={25}
            max={100}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>25% (Tiny)</span>
            <span>50%</span>
            <span>100% (Original)</span>
          </div>
        </div>
      </div>

      {/* Image Preprocessing */}
      {safeConfig.imageData && (
        <div className="border-t border-white/10 pt-6 space-y-4">
          <h3 className="text-md font-semibold text-white font-mono">Image Preprocessing</h3>

          {/* Image Preview Comparison */}
          <div className="space-y-3">
            {safeConfig.imageFrames && safeConfig.imageFrames.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-green-400 font-mono">
                <span className="animate-pulse">●</span>
                GIF Animation ({safeConfig.imageFrames.length} frames @ {safeConfig.animationSpeed} FPS)
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {/* Original */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-2 font-mono">
                  Original
                  {safeConfig.imageFrames && safeConfig.imageFrames.length > 1 && (
                    <span className="text-green-400"> (Animated)</span>
                  )}
                </label>
                <div className="relative bg-black rounded border border-white/20 overflow-hidden aspect-square">
                  <canvas
                    ref={originalCanvasRef}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Preprocessed */}
              <div>
                <label className="block text-xs font-medium text-white/60 mb-2 font-mono">
                  Preprocessed
                  {!safeConfig.preprocessing.showEffect && (
                    <span className="text-yellow-400/80"> (Disabled)</span>
                  )}
                </label>
                <div className="relative bg-black rounded border border-white/20 overflow-hidden aspect-square">
                  <canvas
                    ref={previewCanvasRef}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Show Effect Toggle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/80 font-mono">
              <input
                type="checkbox"
                checked={safeConfig.preprocessing.showEffect}
                onChange={(e) =>
                  updateConfig('preprocessing', {
                    ...safeConfig.preprocessing,
                    showEffect: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
              [★] Show Effect
            </label>
            <p className="text-xs text-white/50 mt-1">
              전처리 효과를 적용합니다
            </p>
          </div>

          {/* Invert Toggle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/80 font-mono">
              <input
                type="checkbox"
                checked={safeConfig.preprocessing.invert}
                onChange={(e) =>
                  updateConfig('preprocessing', {
                    ...safeConfig.preprocessing,
                    invert: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
              [◐] Invert Colors
            </label>
            <p className="text-xs text-white/50 mt-1">
              흑백 반전 (어두운 부분 ↔ 밝은 부분)
            </p>
          </div>

          {/* Blur */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Blur: {safeConfig.preprocessing.blur}
            </label>
            <p className="text-xs text-white/40 mb-2">
              이미지 흐림 효과 (높을수록 디테일 손실 ↑)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.blur}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  blur: parseInt(e.target.value),
                })
              }
              min={0}
              max={20}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Sharp</span>
              <span>Soft</span>
            </div>
          </div>

          {/* Grain */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Grain: {safeConfig.preprocessing.grain}
            </label>
            <p className="text-xs text-white/40 mb-2">
              필름 노이즈 효과 (높을수록 거친 질감, 디테일 감소 ↑)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.grain}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  grain: parseInt(e.target.value),
                })
              }
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Clean</span>
              <span>Grainy</span>
            </div>
          </div>

          {/* Gamma */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Gamma: {safeConfig.preprocessing.gamma.toFixed(2)}
            </label>
            <p className="text-xs text-white/40 mb-2">
              중간톤 밝기 조절 (&lt;1: 어둡게, =1: 원본, &gt;1: 밝게)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.gamma * 100}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  gamma: parseInt(e.target.value) / 100,
                })
              }
              min={10}
              max={300}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>0.1 (Dark)</span>
              <span>1.0 (Normal)</span>
              <span>3.0 (Bright)</span>
            </div>
          </div>

          {/* Black Point */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Black Point: {safeConfig.preprocessing.blackPoint}
            </label>
            <p className="text-xs text-white/40 mb-2">
              어두운 영역 임계값 (낮을수록 어두운 부분 살림 → 디테일 ↑)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.blackPoint}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  blackPoint: parseInt(e.target.value),
                })
              }
              min={0}
              max={255}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>0 (More Detail)</span>
              <span>255 (High Contrast)</span>
            </div>
          </div>

          {/* White Point */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              White Point: {safeConfig.preprocessing.whitePoint}
            </label>
            <p className="text-xs text-white/40 mb-2">
              밝은 영역 임계값 (높을수록 밝은 부분 살림 → 디테일 ↑)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.whitePoint}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  whitePoint: parseInt(e.target.value),
                })
              }
              min={0}
              max={255}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>0 (High Contrast)</span>
              <span>255 (More Detail)</span>
            </div>
          </div>

          {/* Threshold */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
              Threshold: {safeConfig.preprocessing.threshold}
            </label>
            <p className="text-xs text-white/40 mb-2">
              패턴 생성 임계값 (낮을수록 패턴 많음 → 밀도 ↑)
            </p>
            <input
              type="range"
              value={safeConfig.preprocessing.threshold}
              onChange={(e) =>
                updateConfig('preprocessing', {
                  ...safeConfig.preprocessing,
                  threshold: parseInt(e.target.value),
                })
              }
              min={0}
              max={255}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>0 (Dense)</span>
              <span>128 (Medium)</span>
              <span>255 (Sparse)</span>
            </div>
          </div>

          {/* Dithering Toggle */}
          <div className="border-t border-white/10 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-white/80 font-mono mb-3">
              <input
                type="checkbox"
                checked={safeConfig.preprocessing.dithering ?? false}
                onChange={(e) =>
                  updateConfig('preprocessing', {
                    ...safeConfig.preprocessing,
                    dithering: e.target.checked,
                  })
                }
                className="w-4 h-4"
              />
              [★★★] Enable Dithering
            </label>
            <p className="text-xs text-white/40 mb-3">
              디더링: 부드러운 명암 전환 (Floyd-Steinberg 알고리즘)
              <br />
              <span className="text-yellow-400/80">💡 명암이 계단처럼 보일 때 활성화!</span>
            </p>

            {/* Dithering Strength */}
            {safeConfig.preprocessing.dithering && (
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1 font-mono">
                  Dithering Strength: {safeConfig.preprocessing.ditheringStrength ?? 50}%
                </label>
                <p className="text-xs text-white/40 mb-2">
                  디더링 강도 (높을수록 효과 강함)
                </p>
                <input
                  type="range"
                  value={safeConfig.preprocessing.ditheringStrength ?? 50}
                  onChange={(e) =>
                    updateConfig('preprocessing', {
                      ...safeConfig.preprocessing,
                      ditheringStrength: parseInt(e.target.value),
                    })
                  }
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-white/30 mt-1">
                  <span>0 (Subtle)</span>
                  <span>50 (Balanced)</span>
                  <span>100 (Strong)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas Size */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Canvas Size: {safeConfig.width}px
        </label>
        <input
          type="range"
          value={safeConfig.width}
          onChange={(e) => {
            const size = parseInt(e.target.value);
            onChange({ ...config, width: size, height: size });
          }}
          min={400}
          max={1200}
          step={100}
          className="w-full"
        />
      </div>

      {/* Cell Size */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Cell Size: {safeConfig.cellSize}px
        </label>
        <p className="text-xs text-white/50 mb-2">그리드 셀 크기 (간격 결정)</p>
        <input
          type="range"
          value={safeConfig.cellSize}
          onChange={(e) => updateConfig('cellSize', parseInt(e.target.value))}
          min={8}
          max={32}
          className="w-full"
        />
      </div>

      {/* Font Size */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Font Size: {safeConfig.fontSize ?? Math.round(safeConfig.cellSize * 0.8)}px
          {!safeConfig.fontSize && ' (Auto)'}
        </label>
        <p className="text-xs text-white/50 mb-2">문자의 실제 크기 (독립 조절 가능)</p>
        <input
          type="range"
          value={safeConfig.fontSize ?? Math.round(safeConfig.cellSize * 0.8)}
          onChange={(e) => updateConfig('fontSize', parseInt(e.target.value))}
          min={6}
          max={50}
          className="w-full"
        />
        {safeConfig.fontSize && (
          <button
            onClick={() => updateConfig('fontSize', undefined)}
            className="mt-2 text-xs text-white/50 hover:text-white/80 font-mono"
          >
            Reset to Auto (cellSize × 0.8)
          </button>
        )}
      </div>


      {/* Animation Speed (FPS) */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          FPS: {safeConfig.animationSpeed}
        </label>
        <input
          type="range"
          value={safeConfig.animationSpeed}
          onChange={(e) => updateConfig('animationSpeed', parseInt(e.target.value))}
          min={10}
          max={60}
          className="w-full"
        />
      </div>

      {/* Pattern Spacing */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Pattern Spacing: {safeConfig.spacing ?? 0}px
          {safeConfig.spacing < -5 && ' (Tight)'}
          {safeConfig.spacing >= -5 && safeConfig.spacing < 0 && ' (Close)'}
          {safeConfig.spacing === 0 && ' (Normal)'}
          {safeConfig.spacing > 0 && safeConfig.spacing <= 5 && ' (Wide)'}
          {safeConfig.spacing > 5 && ' (Very Wide)'}
        </label>
        <p className="text-xs text-white/50 mb-2">
          문자 사이 간격 (음수=좁힘, 0=기본, 양수=넓힘)
        </p>
        <input
          type="range"
          value={safeConfig.spacing ?? 0}
          onChange={(e) => updateConfig('spacing', parseInt(e.target.value))}
          min={-10}
          max={10}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-white/40 mt-1">
          <span>-10 (Tight)</span>
          <span>0 (Normal)</span>
          <span>+10 (Wide)</span>
        </div>
        <div className="text-xs text-white/30 mt-2 font-mono">
          Actual cell size: {safeConfig.cellSize + (safeConfig.spacing ?? 0)}px
        </div>
      </div>

      {/* Grid Density (for no image) */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Grid Density: {(safeConfig.density * 100).toFixed(0)}%
        </label>
        <p className="text-xs text-white/50 mb-2">
          배경 패턴 밀도 (이미지가 없을 때만 적용)
        </p>
        <input
          type="range"
          value={safeConfig.density * 100}
          onChange={(e) => updateConfig('density', parseInt(e.target.value) / 100)}
          min={0}
          max={100}
          className="w-full"
        />
      </div>

      {/* Brightness Mapping Toggle */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-white/80 font-mono">
          <input
            type="checkbox"
            checked={safeConfig.useBrightnessMapping}
            onChange={(e) => updateConfig('useBrightnessMapping', e.target.checked)}
            className="w-4 h-4"
          />
          [★] Use Brightness Mapping
        </label>
        <p className="text-xs text-white/50 mt-1">
          명암값에 따라 다른 문자 사용 (더 풍부한 표현)
        </p>
      </div>

      {/* Background Character */}
      {!safeConfig.useBrightnessMapping && (
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
            Background Character
          </label>
          <p className="text-xs text-white/50 mb-2">단일 배경 문자 (Brightness Mapping 비활성 시)</p>
          <div className="grid grid-cols-4 gap-2">
            {(['-', '=', '≡', '∙', '·', '‧', '•', '∘'] as BackgroundCharacter[]).map((char) => (
              <button
                key={char}
                onClick={() => updateConfig('backgroundChar', char)}
                className={`p-3 rounded-md font-mono text-lg transition-colors ${
                  safeConfig.backgroundChar === char
                    ? 'bg-red-600 text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                {char}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brightness Levels Editor */}
      {safeConfig.useBrightnessMapping && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-white/80 font-mono">
                Brightness Levels ({safeConfig.brightnessLevels.length})
              </label>
              <p className="text-xs text-white/50">명암에 따른 문자 매핑 (어두움 → 밝음)</p>
            </div>
            <button
              onClick={() => {
                const newLevel: BrightnessLevel = {
                  threshold: 128,
                  char: '◎',
                  name: 'Custom',
                };
                const newLevels = [...safeConfig.brightnessLevels, newLevel].sort(
                  (a, b) => a.threshold - b.threshold
                );
                updateConfig('brightnessLevels', newLevels);
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-mono transition-colors"
            >
              + Add Level
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {safeConfig.brightnessLevels.map((level, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/10"
              >
                {/* Threshold input */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-white/40 font-mono">≤</label>
                  <input
                    type="number"
                    value={level.threshold}
                    onChange={(e) => {
                      const newLevels = [...safeConfig.brightnessLevels];
                      newLevels[index] = {
                        ...level,
                        threshold: parseInt(e.target.value) || 0,
                      };
                      // Sort by threshold
                      newLevels.sort((a, b) => a.threshold - b.threshold);
                      updateConfig('brightnessLevels', newLevels);
                    }}
                    min={0}
                    max={255}
                    className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs font-mono"
                  />
                </div>

                {/* Character input */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-white/40 font-mono">Char</label>
                  <input
                    type="text"
                    value={level.char}
                    onChange={(e) => {
                      const newChar = e.target.value.slice(0, 1);
                      const newLevels = [...safeConfig.brightnessLevels];
                      newLevels[index] = {
                        ...level,
                        char: newChar || ' ',
                      };
                      updateConfig('brightnessLevels', newLevels);
                    }}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    maxLength={1}
                    placeholder="?"
                    className="w-12 px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-center text-xl font-mono"
                  />
                </div>

                {/* Name input */}
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-white/40 font-mono">Name</label>
                  <input
                    type="text"
                    value={level.name}
                    onChange={(e) => {
                      const newLevels = [...safeConfig.brightnessLevels];
                      newLevels[index] = {
                        ...level,
                        name: e.target.value,
                      };
                      updateConfig('brightnessLevels', newLevels);
                    }}
                    className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-xs font-mono"
                  />
                </div>

                {/* Delete button */}
                <button
                  onClick={() => {
                    if (safeConfig.brightnessLevels.length > 1) {
                      const newLevels = safeConfig.brightnessLevels.filter((_, i) => i !== index);
                      updateConfig('brightnessLevels', newLevels);
                    }
                  }}
                  disabled={safeConfig.brightnessLevels.length <= 1}
                  className="px-2 py-1 bg-red-600/50 hover:bg-red-600 disabled:bg-white/5 disabled:text-white/20 text-white text-xs rounded font-mono transition-colors"
                  title="Delete level"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Reset button */}
          <button
            onClick={() => updateConfig('brightnessLevels', DEFAULT_BRIGHTNESS_LEVELS)}
            className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded font-mono transition-colors"
          >
            Reset to Default
          </button>
        </div>
      )}

      {/* Canvas Background Color */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Canvas Background Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={safeConfig.canvasBackgroundColor || '#000000'}
            onChange={(e) => updateConfig('canvasBackgroundColor', e.target.value)}
            className="w-16 h-10 rounded-md border border-white/20 cursor-pointer"
          />
          <input
            type="text"
            value={safeConfig.canvasBackgroundColor || '#000000'}
            onChange={(e) => updateConfig('canvasBackgroundColor', e.target.value)}
            placeholder="#000000"
            className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white font-mono text-sm"
          />
        </div>
      </div>

      {/* Pattern Background Color */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2 font-mono">
          Pattern Background Color
        </label>
        <p className="text-xs text-white/50 mb-2">배경 문자의 색상</p>
        <div className="flex gap-2">
          <input
            type="color"
            value={safeConfig.backgroundColor}
            onChange={(e) => updateConfig('backgroundColor', e.target.value)}
            className="w-16 h-10 rounded-md border border-white/20 cursor-pointer"
          />
          <input
            type="text"
            value={safeConfig.backgroundColor}
            onChange={(e) => updateConfig('backgroundColor', e.target.value)}
            placeholder="#666666"
            className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white font-mono text-sm"
          />
        </div>
      </div>

    </div>
  );
}
