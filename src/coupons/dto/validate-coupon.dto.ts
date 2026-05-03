import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'PIZZA10', description: 'Código do cupom a validar' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 80.00, description: 'Valor total do pedido antes do desconto' })
  @IsNumber()
  @Min(0)
  orderTotal!: number;

  @ApiPropertyOptional({ example: '111.222.333-44', description: 'CPF do cliente (para checar maxUsesPerCpf)' })
  @IsOptional()
  @IsString()
  cpf?: string;
}
