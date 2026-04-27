import { ApiProperty } from '@nestjs/swagger';

/**
 * Envelope padrão que o TransformInterceptor aplica em todas as respostas de sucesso.
 * Use ApiWrappedResponse<T> para documentar o shape real no Swagger.
 */
export class ApiWrappedResponse<T> {
  @ApiProperty({ description: 'Payload da resposta' })
  data: T;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: '2026-04-26T21:00:00.000Z' })
  timestamp: string;
}

/** Shape de erro padrão do HttpExceptionFilter */
export class ApiErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Mensagem de erro', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: '/api/v1/auth/login' })
  path: string;

  @ApiProperty({ example: '2026-04-26T21:00:00.000Z' })
  timestamp: string;
}
