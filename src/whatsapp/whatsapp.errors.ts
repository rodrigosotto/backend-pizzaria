import { HttpException, HttpStatus } from '@nestjs/common';

export type WhatsAppErrorKind =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'rate_limited' | 'provider' | 'timeout' | 'network' | 'unknown';

export class WhatsAppApiError extends HttpException {
  constructor(
    public readonly kind: WhatsAppErrorKind,
    message: string,
    public readonly statusCode?: number,
    public readonly providerCode?: number,
    public readonly providerType?: string,
    public readonly fbtraceId?: string,
    public readonly retryable = false,
  ) {
    super(
      { message, kind, retryable, providerCode },
      WhatsAppApiError.httpStatusFor(kind, statusCode),
    );
    this.name = 'WhatsAppApiError';
  }

  private static httpStatusFor(kind: WhatsAppErrorKind, providerStatus?: number): number {
    if (providerStatus && providerStatus >= 400 && providerStatus < 600) return providerStatus;
    if (kind === 'timeout' || kind === 'network' || kind === 'provider') return HttpStatus.BAD_GATEWAY;
    if (kind === 'unauthorized') return HttpStatus.UNAUTHORIZED;
    if (kind === 'forbidden') return HttpStatus.FORBIDDEN;
    if (kind === 'rate_limited') return HttpStatus.TOO_MANY_REQUESTS;
    if (kind === 'not_found') return HttpStatus.NOT_FOUND;
    return HttpStatus.BAD_REQUEST;
  }
}
