import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional({ example: false, description: 'Bloquear/desbloquear cliente' })
  @IsOptional()
  @IsBoolean()
  isBlacklisted?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'Ajuste manual de selos de fidelidade' })
  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyStamps?: number;
}
