import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class OpenCashSessionDto {
  @ApiProperty({
    example: 150.0,
    description: 'Valor inicial em dinheiro no caixa (fundo de troco)',
  })
  @IsNumber()
  @Min(0)
  initialAmount: number;
}
