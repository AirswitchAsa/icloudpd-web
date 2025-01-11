declare module "streamsaver" {
  interface WritableStream {
    getWriter(): WritableStreamDefaultWriter;
  }

  interface WritableStreamDefaultWriter {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): void;
  }

  interface StreamSaver {
    createWriteStream(filename: string): WritableStream;
    mitm: string;
  }

  const streamSaver: StreamSaver;
  export default streamSaver;
}
