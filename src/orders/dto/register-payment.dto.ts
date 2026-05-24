import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RegisterPaymentDto {
  @ApiProperty({
    enum: PaymentMethod,
    example: 'pix',
    description: 'Forma de pagamento: cash | credit | debit | pix | voucher',
  })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    example: 50.0,
    description: 'Valor recebido em dinheiro (apenas para cash) — usado para calcular o troco',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}
