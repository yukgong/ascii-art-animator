'use client';

import React from 'react';
import {
  DEFAULT_BRIGHTNESS_LEVELS,
  preprocessImage,
  type AsciiConfig,
  type BackgroundCharacter,
  type BrightnessLevel,
} from '@/lib/animations/ascii-engine';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import { type Lang, getTexts } from '@/lib/i18n';

const InfoTooltip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger className="ml-1 inline-flex items-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors outline-none">
      <InfoIcon className="size-3" />
    </TooltipTrigger>
    <TooltipContent side="right">{text}</TooltipContent>
  </Tooltip>
);

interface AsciiControlPanelProps {
  config: AsciiConfig;
  onChange: (config: AsciiConfig) => void;
  lang?: Lang;
}

export default function AsciiControlPanel({
  config,
  onChange,
  lang = 'ko',
}: AsciiControlPanelProps) {
  const tx = getTexts(lang);
  const s = tx.sections;

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
        invert: false,
      },
      useBrightnessMapping: config.useBrightnessMapping ?? true,
      brightnessLevels: config.brightnessLevels || DEFAULT_BRIGHTNESS_LEVELS,
      spacing: config.spacing ?? 0,
    }),
    [config]
  );

  const updateConfig = React.useCallback(
    <K extends keyof AsciiConfig>(key: K, value: AsciiConfig[K]) => {
      onChange({ ...config, [key]: value });
    },
    [onChange, config]
  );


  const [openItems, setOpenItems] = React.useState<string[]>(['canvas', 'animation', 'chars', 'colors']);
  const [previewRevision, setPreviewRevision] = React.useState(0);

  // When imageData first appears, open the adjust panel and schedule a canvas redraw
  // after the DOM has mounted the canvas elements
  React.useEffect(() => {
    if (config.imageData) {
      setOpenItems(prev => prev.includes('adjust') ? prev : [...prev, 'adjust']);
      const t = setTimeout(() => setPreviewRevision(r => r + 1), 0);
      return () => clearTimeout(t);
    }
  }, [config.imageData]);

  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const gifPreviewFrameRef = React.useRef<number>(0);
  const gifPreviewIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (!config.imageData) return;

    const updatePreview = () => {
      if (!previewCanvasRef.current || !originalCanvasRef.current) return;

      let currentImageData = config.imageData!;
      if (config.imageFrames && config.imageFrames.length > 0) {
        currentImageData = config.imageFrames[gifPreviewFrameRef.current % config.imageFrames.length];
      }

      if (!currentImageData?.width || !currentImageData?.height) return;

      const originalCtx = originalCanvasRef.current.getContext('2d');
      if (originalCtx) {
        originalCanvasRef.current.width = currentImageData.width;
        originalCanvasRef.current.height = currentImageData.height;
        originalCtx.putImageData(currentImageData, 0, 0);
      }

      const previewCtx = previewCanvasRef.current.getContext('2d');
      if (previewCtx) {
        previewCanvasRef.current.width = currentImageData.width;
        previewCanvasRef.current.height = currentImageData.height;
        if (config.preprocessing.showEffect) {
          previewCtx.putImageData(preprocessImage(currentImageData, config.preprocessing), 0, 0);
        } else {
          previewCtx.putImageData(currentImageData, 0, 0);
        }
      }
    };

    updatePreview();

    if (config.imageFrames && config.imageFrames.length > 1) {
      gifPreviewIntervalRef.current = setInterval(() => {
        gifPreviewFrameRef.current = (gifPreviewFrameRef.current + 1) % config.imageFrames!.length;
        updatePreview();
      }, config.gifFrameDelay || 100);
    } else {
      if (gifPreviewIntervalRef.current) {
        clearInterval(gifPreviewIntervalRef.current);
        gifPreviewIntervalRef.current = null;
      }
      gifPreviewFrameRef.current = 0;
    }

    return () => {
      if (gifPreviewIntervalRef.current) clearInterval(gifPreviewIntervalRef.current);
    };
  }, [config.imageData, config.imageFrames, config.gifFrameDelay, config.preprocessing, previewRevision]);

  return (
    <Accordion multiple value={openItems} onValueChange={(v) => setOpenItems(v)}>

      {/* ── 이미지 조정 (imageData 있을 때만) ── */}
      {safeConfig.imageData && (
        <AccordionItem value="adjust" className="border-0">
          <AccordionTrigger className="px-4 py-2 text-sm font-medium">
            <span>{s.adjust}</span>
            {safeConfig.imageFrames && safeConfig.imageFrames.length > 1 && (
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {safeConfig.imageFrames.length}f GIF
              </Badge>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-4 pb-3 space-y-3">
              {/* 미리보기 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx.adjust.original}</Label>
                  <div className="aspect-square bg-muted overflow-hidden border">
                    <canvas ref={originalCanvasRef} className="w-full h-full object-contain" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {tx.adjust.processed}{!safeConfig.preprocessing.showEffect && <span className="text-amber-500"> {tx.adjust.processedOff}</span>}
                  </Label>
                  <div className="aspect-square bg-muted overflow-hidden border">
                    <canvas ref={previewCanvasRef} className="w-full h-full object-contain" />
                  </div>
                </div>
              </div>

              <Separator />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{tx.adjust.posSection}</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">{tx.adjust.scale}</Label>
                    <InfoTooltip text={tx.adjust.scaleTip} />
                  </div>
                  <span className="text-xs font-mono tabular-nums">{((config.imageScale ?? 1.0) * 100).toFixed(0)}%</span>
                </div>
                <Slider value={(config.imageScale ?? 1.0) * 100} onValueChange={(v) => updateConfig('imageScale', (v as number) / 100)} min={10} max={300} step={5} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">{tx.adjust.offsetX}</Label>
                    <InfoTooltip text={tx.adjust.offsetXTip} />
                  </div>
                  <span className="text-xs font-mono tabular-nums">{config.imageOffsetX ?? 0}%</span>
                </div>
                <Slider value={config.imageOffsetX ?? 0} onValueChange={(v) => updateConfig('imageOffsetX', v as number)} min={-100} max={100} step={1} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">{tx.adjust.offsetY}</Label>
                    <InfoTooltip text={tx.adjust.offsetYTip} />
                  </div>
                  <span className="text-xs font-mono tabular-nums">{config.imageOffsetY ?? 0}%</span>
                </div>
                <Slider value={config.imageOffsetY ?? 0} onValueChange={(v) => updateConfig('imageOffsetY', v as number)} min={-100} max={100} step={1} />
              </div>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => { updateConfig('imageScale', 1.0); updateConfig('imageOffsetX', 0); updateConfig('imageOffsetY', 0); }}>
                {tx.adjust.resetTransform}
              </Button>

              <Separator />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{tx.adjust.preSection}</p>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs">{tx.adjust.showEffect}</Label>
                  <InfoTooltip text={tx.adjust.showEffectTip} />
                </div>
                <Switch checked={safeConfig.preprocessing.showEffect} onCheckedChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, showEffect: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs">{tx.adjust.invert}</Label>
                  <InfoTooltip text={tx.adjust.invertTip} />
                </div>
                <Switch checked={safeConfig.preprocessing.invert} onCheckedChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, invert: v })} />
              </div>

              {[
                { label: tx.adjust.blur, key: 'blur' as const, min: 0, max: 20, step: 1, tip: tx.adjust.blurTip, display: safeConfig.preprocessing.blur },
                { label: tx.adjust.grain, key: 'grain' as const, min: 0, max: 100, step: 1, tip: tx.adjust.grainTip, display: safeConfig.preprocessing.grain },
              ].map(({ label, key, min, max, step, tip, display }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <InfoTooltip text={tip} />
                    </div>
                    <span className="text-xs font-mono tabular-nums">{display}</span>
                  </div>
                  <Slider value={display} onValueChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, [key]: v as number })} min={min} max={max} step={step} />
                </div>
              ))}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">{tx.adjust.gamma}</Label>
                    <InfoTooltip text={tx.adjust.gammaTip} />
                  </div>
                  <span className="text-xs font-mono tabular-nums">{safeConfig.preprocessing.gamma.toFixed(2)}</span>
                </div>
                <Slider value={safeConfig.preprocessing.gamma * 100} onValueChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, gamma: (v as number) / 100 })} min={10} max={300} step={1} />
              </div>

              {[
                { label: tx.adjust.blackPoint, key: 'blackPoint' as const, tip: tx.adjust.blackPointTip, display: safeConfig.preprocessing.blackPoint },
                { label: tx.adjust.whitePoint, key: 'whitePoint' as const, tip: tx.adjust.whitePointTip, display: safeConfig.preprocessing.whitePoint },
                { label: tx.adjust.threshold, key: 'threshold' as const, tip: tx.adjust.thresholdTip, display: safeConfig.preprocessing.threshold },
              ].map(({ label, key, tip, display }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <InfoTooltip text={tip} />
                    </div>
                    <span className="text-xs font-mono tabular-nums">{display}</span>
                  </div>
                  <Slider value={display} onValueChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, [key]: v as number })} min={0} max={255} step={1} />
                </div>
              ))}

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs">{tx.adjust.dithering}</Label>
                  <InfoTooltip text={tx.adjust.ditheringTip} />
                </div>
                <Switch checked={safeConfig.preprocessing.dithering ?? false} onCheckedChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, dithering: v })} />
              </div>
              {safeConfig.preprocessing.dithering && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{tx.adjust.ditheringStrength}</Label>
                    <span className="text-xs font-mono tabular-nums">{safeConfig.preprocessing.ditheringStrength ?? 50}%</span>
                  </div>
                  <Slider value={safeConfig.preprocessing.ditheringStrength ?? 50} onValueChange={(v) => updateConfig('preprocessing', { ...safeConfig.preprocessing, ditheringStrength: v as number })} min={0} max={100} step={5} />
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* ── 캔버스 ── */}
      <AccordionItem value="canvas" className="border-0">
        <AccordionTrigger className="px-4 py-2 text-sm font-medium">{s.canvas}</AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-3 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.canvas.size}</Label>
                  <InfoTooltip text={tx.canvas.sizeTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{safeConfig.width}px</span>
              </div>
              <Slider value={safeConfig.width} onValueChange={(v) => onChange({ ...config, width: v as number, height: v as number })} min={400} max={1200} step={100} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.canvas.cellSize}</Label>
                  <InfoTooltip text={tx.canvas.cellSizeTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{safeConfig.cellSize}px</span>
              </div>
              <Slider value={safeConfig.cellSize} onValueChange={(v) => updateConfig('cellSize', v as number)} min={8} max={32} step={1} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.canvas.fontSize}</Label>
                  <InfoTooltip text={tx.canvas.fontSizeTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">
                  {safeConfig.fontSize ?? Math.round(safeConfig.cellSize * 0.8)}px
                  {!safeConfig.fontSize && <span className="text-muted-foreground/50"> {tx.canvas.fontAuto}</span>}
                </span>
              </div>
              <Slider value={safeConfig.fontSize ?? Math.round(safeConfig.cellSize * 0.8)} onValueChange={(v) => updateConfig('fontSize', v as number)} min={6} max={50} step={1} />
              {safeConfig.fontSize && (
                <button onClick={() => updateConfig('fontSize', undefined)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                  {tx.canvas.fontAutoReset}
                </button>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.canvas.spacing}</Label>
                  <InfoTooltip text={tx.canvas.spacingTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{safeConfig.spacing ?? 0}px</span>
              </div>
              <Slider value={safeConfig.spacing ?? 0} onValueChange={(v) => updateConfig('spacing', v as number)} min={-10} max={10} step={1} />
              <p className="text-xs text-muted-foreground/50">{tx.canvas.actualCell} {safeConfig.cellSize + (safeConfig.spacing ?? 0)}px</p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── 애니메이션 ── */}
      <AccordionItem value="animation" className="border-0">
        <AccordionTrigger className="px-4 py-2 text-sm font-medium">{s.animation}</AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-3 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.animation.fps}</Label>
                  <InfoTooltip text={tx.animation.fpsTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{safeConfig.animationSpeed}</span>
              </div>
              <Slider value={safeConfig.animationSpeed} onValueChange={(v) => updateConfig('animationSpeed', v as number)} min={10} max={60} step={1} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.animation.density}</Label>
                  <InfoTooltip text={tx.animation.densityTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{(safeConfig.density * 100).toFixed(0)}%</span>
              </div>
              <Slider value={safeConfig.density * 100} onValueChange={(v) => updateConfig('density', (v as number) / 100)} min={0} max={100} step={1} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── 문자 매핑 ── */}
      <AccordionItem value="chars" className="border-0">
        <AccordionTrigger className="px-4 py-2 text-sm font-medium">{s.chars}</AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Label className="text-xs">{tx.chars.useMapping}</Label>
                <InfoTooltip text={tx.chars.useMappingTip} />
              </div>
              <Switch checked={safeConfig.useBrightnessMapping} onCheckedChange={(v) => updateConfig('useBrightnessMapping', v)} />
            </div>

            {!safeConfig.useBrightnessMapping && (
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.chars.bgChar}</Label>
                  <InfoTooltip text={tx.chars.bgCharTip} />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['-', '=', '≡', '∙', '·', '‧', '•', '∘'] as BackgroundCharacter[]).map((char) => (
                    <button
                      key={char}
                      onClick={() => updateConfig('backgroundChar', char)}
                      className={`p-2 rounded-none font-mono text-base transition-colors border ${
                        safeConfig.backgroundChar === char
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-foreground border-border hover:bg-accent'
                      }`}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {safeConfig.useBrightnessMapping && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Label className="text-xs text-muted-foreground">{tx.chars.levels} ({safeConfig.brightnessLevels.length})</Label>
                    <InfoTooltip text={tx.chars.levelsTip} />
                  </div>
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => {
                      const newLevel: BrightnessLevel = { threshold: 128, char: '◎', name: 'Custom' };
                      const newLevels = [...safeConfig.brightnessLevels, newLevel].sort((a, b) => a.threshold - b.threshold);
                      updateConfig('brightnessLevels', newLevels);
                    }}
                  >
                    {tx.chars.addLevel}
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {safeConfig.brightnessLevels.map((level, index) => (
                    <div key={index} className="flex items-center gap-1.5 p-2 bg-muted/60">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground font-mono text-center">≤</span>
                        <input
                          type="number"
                          value={level.threshold}
                          onChange={(e) => {
                            const newLevels = [...safeConfig.brightnessLevels];
                            newLevels[index] = { ...level, threshold: parseInt(e.target.value) || 0 };
                            newLevels.sort((a, b) => a.threshold - b.threshold);
                            updateConfig('brightnessLevels', newLevels);
                          }}
                          min={0} max={255}
                          className="w-13 px-1.5 py-1 bg-background border text-xs font-mono text-center"
                        />
                      </div>
                      <input
                        type="text"
                        value={level.char}
                        onChange={(e) => {
                          const newChar = e.target.value.slice(0, 1);
                          const newLevels = [...safeConfig.brightnessLevels];
                          newLevels[index] = { ...level, char: newChar || ' ' };
                          updateConfig('brightnessLevels', newLevels);
                        }}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => e.currentTarget.select()}
                        maxLength={1}
                        className="w-9 px-1 py-1 bg-background border text-center text-base font-mono shrink-0"
                      />
                      <input
                        type="text"
                        value={level.name}
                        onChange={(e) => {
                          const newLevels = [...safeConfig.brightnessLevels];
                          newLevels[index] = { ...level, name: e.target.value };
                          updateConfig('brightnessLevels', newLevels);
                        }}
                        className="flex-1 px-1.5 py-1 bg-background border text-xs font-mono min-w-0"
                      />
                      <button
                        onClick={() => {
                          if (safeConfig.brightnessLevels.length > 1) {
                            updateConfig('brightnessLevels', safeConfig.brightnessLevels.filter((_, i) => i !== index));
                          }
                        }}
                        disabled={safeConfig.brightnessLevels.length <= 1}
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors shrink-0 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => updateConfig('brightnessLevels', DEFAULT_BRIGHTNESS_LEVELS)}>
                  {tx.chars.resetLevels}
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── 색상 ── */}
      <AccordionItem value="colors" className="border-0">
        <AccordionTrigger className="px-4 py-2 text-sm font-medium">{s.colors}</AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-3 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center">
                <Label className="text-xs text-muted-foreground">{tx.colors.canvasBg}</Label>
                <InfoTooltip text={tx.colors.canvasBgTip} />
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={safeConfig.canvasBackgroundColor || '#000000'} onChange={(e) => updateConfig('canvasBackgroundColor', e.target.value)} className="w-9 h-9 border cursor-pointer p-0.5 shrink-0" />
                <Input value={safeConfig.canvasBackgroundColor || '#000000'} onChange={(e) => updateConfig('canvasBackgroundColor', e.target.value)} placeholder="#000000" className="font-mono text-xs h-9" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <Label className="text-xs text-muted-foreground">{tx.colors.patternColor}</Label>
                <InfoTooltip text={tx.colors.patternColorTip} />
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={safeConfig.backgroundColor} onChange={(e) => updateConfig('backgroundColor', e.target.value)} className="w-9 h-9 border cursor-pointer p-0.5 shrink-0" />
                <Input value={safeConfig.backgroundColor} onChange={(e) => updateConfig('backgroundColor', e.target.value)} placeholder="#666666" className="font-mono text-xs h-9" />
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* ── 내보내기 ── */}
      <AccordionItem value="export" className="border-0">
        <AccordionTrigger className="px-4 py-2 text-sm font-medium">{s.export}</AccordionTrigger>
        <AccordionContent>
          <div className="px-4 pb-3 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.export.quality}</Label>
                  <InfoTooltip text={tx.export.qualityTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{config.gifExportQuality ?? 21}</span>
              </div>
              <Slider value={config.gifExportQuality ?? 21} onValueChange={(v) => updateConfig('gifExportQuality', v as number)} min={1} max={30} step={1} />
              <div className="flex justify-between text-xs text-muted-foreground/50">
                <span>{tx.export.qualitySmall}</span>
                <span>{tx.export.qualityBest}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs text-muted-foreground">{tx.export.scale}</Label>
                  <InfoTooltip text={tx.export.scaleTip} />
                </div>
                <span className="text-xs font-mono tabular-nums">{((config.gifExportScale ?? 1.0) * 100).toFixed(0)}%</span>
              </div>
              <Slider value={(config.gifExportScale ?? 1.0) * 100} onValueChange={(v) => updateConfig('gifExportScale', (v as number) / 100)} min={25} max={100} step={5} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

    </Accordion>
  );
}
