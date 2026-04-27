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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode as number;
          const ms = Date.now() - start;
          this.logger.log(`${method} ${url} ${statusCode} +${ms}ms`);
        },
        error: (err: Error) => {
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ERR +${ms}ms — ${err.message}`);
        },
      }),
    );
  }
}
