import { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";
import { Duplex } from "stream";

type AppHandler = (req: IncomingMessage, res: ServerResponse) => void;

type ResponseHeaders = Record<string, string>;

export type TestResponse = {
  status: number;
  body: unknown;
  headers: ResponseHeaders;
  text: string;
};

type HeaderValue = string | number | readonly string[];

function normalizeHeaders(
  headers: Record<string, HeaderValue | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.join(", ")
      : String(value);
  }

  return normalized;
}

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (chunk === undefined || chunk === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk), encoding);
}

function decodeChunkedBody(body: Buffer): Buffer {
  const decoded: Buffer[] = [];
  let offset = 0;

  while (offset < body.length) {
    const lineEnd = body.indexOf("\r\n", offset, "utf8");
    if (lineEnd === -1) break;

    const sizeHex = body.slice(offset, lineEnd).toString("utf8").trim();
    const size = Number.parseInt(sizeHex, 16);
    if (!Number.isFinite(size) || size < 0) break;
    if (size === 0) break;

    const chunkStart = lineEnd + 2;
    const chunkEnd = chunkStart + size;
    decoded.push(body.slice(chunkStart, chunkEnd));
    offset = chunkEnd + 2;
  }

  return Buffer.concat(decoded);
}

function extractBodyFromRawResponse(raw: Buffer): Buffer {
  const separator = raw.indexOf(Buffer.from("\r\n\r\n"));
  if (separator === -1) return raw;

  const headerText = raw.slice(0, separator).toString("utf8");
  const headerLines = headerText.split("\r\n").slice(1);
  const headers: Record<string, string> = {};

  for (const line of headerLines) {
    const split = line.indexOf(":");
    if (split === -1) continue;
    headers[line.slice(0, split).trim().toLowerCase()] = line
      .slice(split + 1)
      .trim();
  }

  const body = raw.slice(separator + 4);
  if (headers["transfer-encoding"]?.toLowerCase() === "chunked") {
    return decodeChunkedBody(body);
  }

  const contentLength = headers["content-length"]
    ? Number.parseInt(headers["content-length"], 10)
    : Number.NaN;
  if (Number.isFinite(contentLength)) {
    return body.slice(0, contentLength);
  }

  return body;
}

class MockSocket extends Duplex {
  readonly chunks: Buffer[] = [];
  remoteAddress = "127.0.0.1";
  localAddress = "127.0.0.1";
  remotePort = 12345;
  localPort = 5000;
  encrypted = false;

  _read(): void {}

  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  setTimeout(): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }

  destroySoon(): void {
    this.destroy();
  }
}

type TestSocket = Socket & MockSocket;

class TestRequest implements PromiseLike<TestResponse> {
  private readonly headers: Record<string, string> = {
    host: "127.0.0.1",
  };
  private payload: Buffer | null = null;

  constructor(
    private readonly app: AppHandler,
    private readonly method: string,
    private readonly path: string,
  ) {}

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(body: unknown): this {
    if (body === undefined) return this;

    if (
      typeof body === "string" ||
      Buffer.isBuffer(body) ||
      body instanceof Uint8Array
    ) {
      this.payload = toBuffer(body);
    } else {
      this.payload = Buffer.from(JSON.stringify(body));
      if (!this.headers["content-type"]) {
        this.headers["content-type"] = "application/json";
      }
    }

    this.headers["content-length"] = String(this.payload.length);
    return this;
  }

  then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: TestResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<TestResponse> {
    const socket = new MockSocket() as TestSocket;
    const req = new IncomingMessage(socket);
    req.method = this.method;
    req.url = this.path;
    req.headers = this.headers;
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    (req as IncomingMessage & { socket: TestSocket }).socket = socket;
    (req as IncomingMessage & { connection: TestSocket }).connection = socket;

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let settled = false;

    res.write = ((chunk: unknown, encoding?: BufferEncoding, cb?: () => void) => {
      const buffer = toBuffer(chunk, encoding);
      if (buffer.length > 0) chunks.push(buffer);
      return originalWrite(chunk as never, encoding as never, cb as never);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encoding?: BufferEncoding, cb?: () => void) => {
      const buffer = toBuffer(chunk, encoding);
      if (buffer.length > 0) chunks.push(buffer);
      const result = originalEnd(chunk as never, encoding as never, cb as never);
      queueMicrotask(() => {
        if (!settled && (res.writableEnded || res.finished)) {
          settled = true;
          finishResolve();
        }
      });
      return result;
    }) as typeof res.end;

    res.assignSocket(socket);

    let finishResolve = () => {};
    const finished = new Promise<void>((resolve, reject) => {
      finishResolve = resolve;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      res.on("finish", resolveOnce);
      res.on("error", reject);
    });

    this.app(req, res);
    queueMicrotask(() => {
      if (this.payload) req.push(this.payload);
      req.push(null);
    });
    await finished;

    const rawBody = extractBodyFromRawResponse(Buffer.concat(socket.chunks));
    const fallbackBody = Buffer.concat(chunks);
    const text = (rawBody.length > 0 ? rawBody : fallbackBody).toString("utf8");
    const headers = normalizeHeaders(
      res.getHeaders() as Record<string, HeaderValue | undefined>,
    );

    let body: unknown = text;
    if (
      headers["content-type"]?.includes("application/json") ||
      /^[\[{]/.test(text.trim())
    ) {
      body = text ? JSON.parse(text) : {};
    }

    return {
      status: res.statusCode,
      body,
      headers,
      text,
    };
  }
}

type TestAgent = Record<
  "get" | "post" | "put" | "delete",
  (path: string) => TestRequest
>;

export function createTestAgent(app: AppHandler): TestAgent {
  return {
    get: (path) => new TestRequest(app, "GET", path),
    post: (path) => new TestRequest(app, "POST", path),
    put: (path) => new TestRequest(app, "PUT", path),
    delete: (path) => new TestRequest(app, "DELETE", path),
  };
}
