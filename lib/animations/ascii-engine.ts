/**
 * ASCII Animation Engine
 * Creates ASCII art from images and GIFs
 */

export type BackgroundCharacter = '-' | '=' | '≡' | '∙' | '·' | '‧' | '•' | '∘' | '*' | '※' | '✱' | '■' | '#' | '@';

export interface BrightnessLevel {
  threshold: number; // 0-255: brightness threshold
  char: string; // Any character
  name: string;
  color?: string; // Optional per-level color (falls back to backgroundColor)
}

// Default brightness levels for rich ASCII art
export const DEFAULT_BRIGHTNESS_LEVELS: BrightnessLevel[] = [
  { threshold: 50, char: '@', name: 'Very Dark' },
  { threshold: 80, char: '■', name: 'Dark' },
  { threshold: 110, char: '※', name: 'Dark-Medium' },
  { threshold: 140, char: '*', name: 'Medium-Dark' },
  { threshold: 170, char: '≡', name: 'Medium' },
  { threshold: 200, char: '=', name: 'Medium-Light' },
  { threshold: 226, char: '-', name: 'Light' },
  { threshold: 255, char: '∙', name: 'Very Light' },
];


export interface ImagePreprocessing {
  blur: number; // 0-20: blur intensity
  grain: number; // 0-100: grain/noise amount
  gamma: number; // 0.1-3.0: gamma correction
  blackPoint: number; // 0-255: pixels below this become black
  whitePoint: number; // 0-255: pixels above this become white
  threshold: number; // 0-255: threshold for background pattern
  showEffect: boolean; // show preprocessing effect
  dithering: boolean; // apply Floyd-Steinberg dithering for smoother gradients
  ditheringStrength: number; // 0-100: dithering strength (error diffusion amount)
  invert: boolean; // invert colors (black <-> white)
}

export interface AsciiConfig {
  width: number;
  height: number;
  cellSize: number;
  fontSize?: number; // Font size in pixels (if not set, defaults to cellSize * 0.8)
  backgroundChar: BackgroundCharacter;
  backgroundColor: string;
  canvasBackgroundColor: string;
  density: number; // 0-1: background pattern density
  spacing: number; // -10 to 10: additional spacing between characters (negative=tighter, positive=wider)
  animationSpeed: number; // frames per second
  trail: boolean; // leave trail effect
  imageData?: ImageData;
  imageFrames?: ImageData[]; // Multiple frames for GIF animation
  gifFrameDelay?: number; // Delay between GIF frames in milliseconds
  preprocessing: ImagePreprocessing;
  useBrightnessMapping: boolean; // Use brightness-based character mapping
  brightnessLevels: BrightnessLevel[]; // Brightness to character mappings
  // GIF Export settings
  gifExportQuality?: number; // 1-30: gif.js quality (lower = better quality, larger file)
  gifExportScale?: number; // 0.25-1.0: export scale (lower = smaller file)
  // Import settings
  importResolution?: number; // 50-300: grid resolution for imported images (higher = more detail)
  // Image transform settings (for positioning imported images in canvas)
  imageScale?: number; // 0.1-3.0: scale of imported image (1.0 = fit to canvas)
  imageOffsetX?: number; // -100 to 100: horizontal offset as percentage of canvas width
  imageOffsetY?: number; // -100 to 100: vertical offset as percentage of canvas height
  // GIF loop settings
  loopMode?: 'normal' | 'pingpong'; // normal: 1→2→3→1, pingpong: 1→2→3→2→1
}

export interface AsciiFrame {
  grid: string[][];
  colors: string[][];
}

/**
/**
/**
 * Select character based on brightness level
 */
function selectLevelByBrightness(
  brightness: number,
  sortedLevels: BrightnessLevel[], // pre-sorted ascending by threshold
  fallbackChar: string,
  fallbackColor: string,
): { char: string; color: string } {
  for (const level of sortedLevels) {
    if (brightness <= level.threshold) {
      return { char: level.char, color: level.color || fallbackColor };
    }
  }
  return { char: fallbackChar, color: fallbackColor };
}

/**
 * Apply Floyd-Steinberg dithering to brightness values
 * Returns a dithered brightness map
 */
function applyDithering(
  brightnessMap: number[][],
  levels: BrightnessLevel[],
  strength: number
): number[][] {
  const rows = brightnessMap.length;
  const cols = brightnessMap[0]?.length || 0;

  // Create a copy to work with
  const dithered: number[][] = brightnessMap.map(row => [...row]);

  // Sort levels for quantization
  const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);

  // Floyd-Steinberg error diffusion
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const oldPixel = dithered[y][x];

      // Find nearest level
      let newPixel = 255; // default to brightest
      for (const level of sorted) {
        if (oldPixel <= level.threshold) {
          newPixel = level.threshold;
          break;
        }
      }

      dithered[y][x] = newPixel;

      // Calculate error
      const error = (oldPixel - newPixel) * (strength / 100);

      // Distribute error to neighboring pixels
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

/**
 * Generate ASCII frame from image data
 */
export function generateFrame(config: AsciiConfig): AsciiFrame {
  // Calculate grid dimensions based on cellSize (pattern count stays the same)
  const cols = Math.floor(config.width / config.cellSize);
  const rows = Math.floor(config.height / config.cellSize);

  // Apply preprocessing if image exists and showEffect is enabled
  let processedImageData = config.imageData;
  if (config.imageData && config.preprocessing.showEffect) {
    processedImageData = preprocessImage(config.imageData, config.preprocessing);
  }

  // Extract brightness map if image exists
  let brightnessMap: number[][] = [];
  if (processedImageData) {
    // Image transform settings
    const imageScale = config.imageScale ?? 1.0;
    const offsetX = (config.imageOffsetX ?? 0) / 100; // Convert percentage to ratio
    const offsetY = (config.imageOffsetY ?? 0) / 100;

    // First pass: extract brightness values with transform applied
    for (let row = 0; row < rows; row++) {
      brightnessMap[row] = [];
      for (let col = 0; col < cols; col++) {
        // Apply scale and offset transformation
        // Center the scaling: transform from canvas center
        const centerCol = cols / 2;
        const centerRow = rows / 2;

        // Calculate position relative to center, apply scale, then add offset
        const scaledCol = centerCol + (col - centerCol) / imageScale - offsetX * cols;
        const scaledRow = centerRow + (row - centerRow) / imageScale - offsetY * rows;

        // Map to image coordinates
        const imgX = Math.floor((scaledCol / cols) * processedImageData.width);
        const imgY = Math.floor((scaledRow / rows) * processedImageData.height);

        // Check if within image bounds
        if (imgX < 0 || imgX >= processedImageData.width || imgY < 0 || imgY >= processedImageData.height) {
          // Outside image bounds - use white (transparent/empty)
          brightnessMap[row][col] = 255;
        } else {
          const pixelIndex = (imgY * processedImageData.width + imgX) * 4;
          const r = processedImageData.data[pixelIndex];
          const g = processedImageData.data[pixelIndex + 1];
          const b = processedImageData.data[pixelIndex + 2];
          const brightness = (r + g + b) / 3;
          brightnessMap[row][col] = brightness;
        }
      }
    }

    // Apply dithering if enabled
    if (config.preprocessing.dithering && config.useBrightnessMapping && config.brightnessLevels.length > 0) {
      brightnessMap = applyDithering(brightnessMap, config.brightnessLevels, config.preprocessing.ditheringStrength);
    }
  }

  // Initialize grid with background
  const grid: string[][] = [];
  const colors: string[][] = [];
  const sortedLevels = [...config.brightnessLevels].sort((a, b) => a.threshold - b.threshold);

  for (let row = 0; row < rows; row++) {
    grid[row] = [];
    colors[row] = [];
    for (let col = 0; col < cols; col++) {
      let char: string = ' ';
      let color: string = config.backgroundColor;

      if (processedImageData) {
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

/**
 * Export frame as text
 */
export function frameToText(frame: AsciiFrame): string {
  return frame.grid.map((row) => row.join('')).join('\n');
}

/**
 * Apply image preprocessing effects
 */
export function preprocessImage(
  imageData: ImageData,
  preprocessing: ImagePreprocessing
): ImageData {
  const { width, height, data } = imageData;

  // Validate dimensions
  if (!width || !height || width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid ImageData dimensions: width=${width}, height=${height}`);
  }

  const processed = new ImageData(width, height);
  const processedData = processed.data;

  // Copy original data
  for (let i = 0; i < data.length; i++) {
    processedData[i] = data[i];
  }

  // 1. Apply Gamma correction
  if (preprocessing.gamma !== 1.0) {
    const gammaCorrection = 1 / preprocessing.gamma;
    for (let i = 0; i < processedData.length; i += 4) {
      processedData[i] = Math.pow(processedData[i] / 255, gammaCorrection) * 255;
      processedData[i + 1] = Math.pow(processedData[i + 1] / 255, gammaCorrection) * 255;
      processedData[i + 2] = Math.pow(processedData[i + 2] / 255, gammaCorrection) * 255;
    }
  }

  // 2. Apply Black/White Point
  const blackPoint = preprocessing.blackPoint;
  const whitePoint = preprocessing.whitePoint;
  const range = whitePoint - blackPoint;

  if (range > 0) {
    for (let i = 0; i < processedData.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let value = processedData[i + c];
        value = ((value - blackPoint) / range) * 255;
        value = Math.max(0, Math.min(255, value));
        processedData[i + c] = value;
      }
    }
  }

  // 3. Apply Blur (simple box blur)
  if (preprocessing.blur > 0) {
    const tempData = new Uint8ClampedArray(processedData);
    const radius = Math.floor(preprocessing.blur);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0,
          g = 0,
          b = 0,
          count = 0;

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
        processedData[idx] = r / count;
        processedData[idx + 1] = g / count;
        processedData[idx + 2] = b / count;
      }
    }
  }

  // 4. Apply Grain/Noise
  if (preprocessing.grain > 0) {
    const grainAmount = preprocessing.grain / 100;
    for (let i = 0; i < processedData.length; i += 4) {
      const noise = (Math.random() - 0.5) * 255 * grainAmount;
      processedData[i] = Math.max(0, Math.min(255, processedData[i] + noise));
      processedData[i + 1] = Math.max(0, Math.min(255, processedData[i + 1] + noise));
      processedData[i + 2] = Math.max(0, Math.min(255, processedData[i + 2] + noise));
    }
  }

  // 5. Apply Invert (after all other effects)
  if (preprocessing.invert) {
    for (let i = 0; i < processedData.length; i += 4) {
      // Calculate brightness (average of RGB)
      const brightness = (processedData[i] + processedData[i + 1] + processedData[i + 2]) / 3;

      // Only invert pixels that are not too bright (preserve white/very light backgrounds)
      // Threshold: 240 - pixels brighter than this won't be inverted
      if (brightness < 240) {
        processedData[i] = 255 - processedData[i]; // Red
        processedData[i + 1] = 255 - processedData[i + 1]; // Green
        processedData[i + 2] = 255 - processedData[i + 2]; // Blue
      }
      // Alpha channel (i+3) remains unchanged
    }
  }

  return processed;
}

/**
 * Load image data for ASCII conversion
 */
export async function loadImageForAscii(
  file: File,
  targetWidth: number,
  targetHeight: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        // Fill with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Calculate scaling to fit
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;

        let drawWidth = targetWidth;
        let drawHeight = targetHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (imgAspect > targetAspect) {
          drawHeight = targetWidth / imgAspect;
          offsetY = (targetHeight - drawHeight) / 2;
        } else {
          drawWidth = targetHeight * imgAspect;
          offsetX = (targetWidth - drawWidth) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        resolve(imageData);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Load GIF frames for ASCII conversion
 */
export async function loadGifForAscii(
  file: File,
  targetWidth: number,
  targetHeight: number
): Promise<{ frames: ImageData[]; delay: number }> {
  // Dynamic import to avoid issues
  const { parseGIF, decompressFrames } = await import('gifuct-js');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const gif = parseGIF(arrayBuffer);
        const frames = decompressFrames(gif, true);

        if (frames.length === 0) {
          reject(new Error('No frames found in GIF'));
          return;
        }

        // Get GIF dimensions from first frame
        const gifWidth = frames[0].dims.width;
        const gifHeight = frames[0].dims.height;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        // Create a persistent canvas for building up frames
        const gifCanvas = document.createElement('canvas');
        gifCanvas.width = gifWidth;
        gifCanvas.height = gifHeight;
        const gifCtx = gifCanvas.getContext('2d');

        if (!gifCtx) {
          reject(new Error('Cannot get GIF canvas context'));
          return;
        }

        const imageFrames: ImageData[] = [];
        let totalDelay = 0;

        // Limit frames for performance (max 50 frames for stability)
        const maxFrames = 50;
        const frameStep = frames.length > maxFrames ? Math.ceil(frames.length / maxFrames) : 1;
        const framesToProcess = frames.length > maxFrames
          ? frames.filter((_, i) => i % frameStep === 0).slice(0, maxFrames)
          : frames;

        // Process each frame
        for (let i = 0; i < framesToProcess.length; i++) {
          const frame = framesToProcess[i];
          const { dims, patch, delay, disposalType } = frame;

          if (!dims || !patch || patch.length === 0) continue;

          if (!dims.width || !dims.height || dims.width <= 0 || dims.height <= 0) continue;

          totalDelay += delay || 100;

          try {
            // Handle disposal method
            if (disposalType === 2) {
              // Restore to background
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

            // Get the complete frame
            const completeFrame = gifCtx.getImageData(0, 0, gifWidth, gifHeight);

            // Scale to target size
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Create temp canvas for scaling
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;
            const tempCtx = tempCanvas.getContext('2d');

            if (!tempCtx) continue;

            tempCtx.putImageData(completeFrame, 0, 0);

            // Calculate scaling
            const imgAspect = gifWidth / gifHeight;
            const targetAspect = targetWidth / targetHeight;

            let drawWidth = targetWidth;
            let drawHeight = targetHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (imgAspect > targetAspect) {
              drawHeight = targetWidth / imgAspect;
              offsetY = (targetHeight - drawHeight) / 2;
            } else {
              drawWidth = targetHeight * imgAspect;
              offsetX = (targetWidth - drawWidth) / 2;
            }

            // Draw scaled frame
            ctx.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
            const scaledImageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            imageFrames.push(scaledImageData);
          } catch {
            continue;
          }
        }

        // Check if we have at least one valid frame
        if (imageFrames.length === 0) {
          reject(new Error('No valid frames found in GIF'));
          return;
        }

        const averageDelay = totalDelay > 0 ? Math.round(totalDelay / imageFrames.length) : 100;

        resolve({
          frames: imageFrames,
          delay: averageDelay,
        });
      } catch (error) {
        reject(new Error(`Failed to parse GIF: ${error instanceof Error ? error.message : String(error)}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
