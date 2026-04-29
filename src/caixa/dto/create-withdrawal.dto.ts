import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ example: 80.0, description: 'Valor da sangria (retirada de dinheiro do caixa)' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'Pagamento de fornecedor — Dist. Paulista', description: 'Motivo da sangria' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
