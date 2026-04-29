import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({
    example: 'Cliente solicitou cancelamento',
    description: 'Motivo obrigatório do cancelamento (RF08). Registrado em auditoria.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
