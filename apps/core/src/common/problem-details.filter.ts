import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

interface ProblemRes {
  setHeader(name: string, value: string): void;
  status(code: number): { send(body: string): void };
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

/**
 * Renders every error as RFC 9457 problem+json (blueprint doc 08). Validation
 * (422) responses carry per-path `errors` from the CAML/catalog validators.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ProblemRes>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    const body: Record<string, unknown> = { type: 'about:blank', title: TITLES[status] ?? 'Error', status };
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'string') body.detail = raw;
      else Object.assign(body, raw);
    } else {
      body.detail = 'Internal server error';
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    // NestJS puts the http status in `statusCode`; problem+json uses `status`.
    delete body.statusCode;

    res.setHeader('Content-Type', 'application/problem+json');
    res.status(status).send(JSON.stringify(body));
  }
}
