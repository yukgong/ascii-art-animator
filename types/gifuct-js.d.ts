declare module 'gifuct-js' {
  export interface GifFrame {
    width: number;
    height: number;
    patch: Uint8ClampedArray;
    delay: number;
    dims: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
    disposalType: number;
    transparentIndex: number | null;
  }

  export interface ParsedGif {
    frames: GifFrame[];
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildPatch: boolean): GifFrame[];
}
