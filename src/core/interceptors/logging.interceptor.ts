import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method } = request;
    const url = String(request.url).split('?')[0];
    const correlationId = request.headers['x-correlation-id']?.toString() || randomUUID();
    const response = context.switchToHttp().getResponse();
    response.header('x-correlation-id', correlationId);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode as number;
          const ms = Date.now() - start;
          this.logger.log(`${method} ${url} ${statusCode} +${ms}ms correlation=${correlationId}`);
        },
        error: (err: Error) => {
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ERR +${ms}ms correlation=${correlationId} error=${err.name}`);
        },
      }),
    );
  }
}
