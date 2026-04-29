import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RegisterPaymentDto {
  @ApiProperty({
    enum: PaymentMethod,
    example: 'pix',
    description: 'Forma de pagamento: cash | credit | debit | pix | voucher',
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    example: 50.0,
    description: 'Valor pago em dinheiro (apenas para cash) — usado para calcular o troco',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;
}
