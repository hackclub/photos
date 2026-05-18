declare module "archiver" {
  import type { Readable, Writable } from "node:stream";

  interface ArchiverOptions {
    zlib?: { level?: number };
  }

  interface EntryData {
    name: string;
    date?: Date;
  }

  class Archiver extends Readable {
    pipe(destination: Writable): void;
    append(source: Buffer | string | Readable, data: EntryData): this;
    finalize(): Promise<void>;
    abort(): void;
  }

  class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  class TarArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  class JsonArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }

  export { Archiver, ZipArchive, TarArchive, JsonArchive };
}
