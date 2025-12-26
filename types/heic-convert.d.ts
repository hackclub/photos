declare module "heic-convert" {
  function heicConvert(options: {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Buffer>;
  export = heicConvert;
}
