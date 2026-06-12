import { Logger } from '@nestjs/common';

const logger = new Logger('http');

interface MinReq {
  method: string;
  originalUrl: string;
}
interface MinRes {
  statusCode: number;
  on(event: 'finish', listener: () => void): void;
}

/** Express-style middleware: one structured line per request with status + latency. */
export function requestLogger(req: MinReq, res: MinRes, next: () => void): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
