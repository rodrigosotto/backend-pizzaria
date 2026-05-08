import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateOrderDto {
  @ApiPropertyOptional({ example: 'Sem cebola', description: 'Observação geral do pedido' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ example: 30, description: 'Tempo estimado em minutos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedTime?: number;

  @ApiPropertyOptional({ description: 'Vincular ou alterar cliente (UUID)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Alterar endereço de entrega (apenas delivery)' })
  @IsOptional()
  @IsUUID()
  deliveryAddressId?: string;
}
