import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CloseCashSessionDto {
  @ApiProperty({
    example: 320.5,
    description:
      'Valor físico contado no caixa ao fechar (RF69). ' +
      'O sistema calcula a diferença em relação ao saldo esperado ' +
      '(fundo inicial + total em dinheiro − sangrias).',
  })
  @IsNumber()
  @Min(0)
  actualBalance: number;
}
