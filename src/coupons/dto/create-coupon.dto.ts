import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ example: 'PIZZA10', description: 'Código do cupom (único por pizzaria)' })
  @IsString()
  @Length(1, 50)
  code!: string;

  @ApiProperty({ enum: DiscountType, description: 'Tipo do desconto: percentage ou fixed' })
  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @ApiProperty({ example: 10, description: 'Valor do desconto (percentual ou R$)' })
  @IsNumber()
  @Min(0)
  discountValue!: number;

  @ApiPropertyOptional({ example: 50, description: 'Valor mínimo do pedido para aplicar o cupom' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @ApiPropertyOptional({ example: 100, description: 'Número máximo de usos totais' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesTotal?: number;

  @ApiPropertyOptional({ example: 1, description: 'Número máximo de usos por CPF' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerCpf?: number;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', description: 'Data de expiração (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
