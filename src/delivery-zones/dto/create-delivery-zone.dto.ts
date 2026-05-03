import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryZoneType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateDeliveryZoneDto {
  @ApiProperty({ enum: DeliveryZoneType, description: 'neighborhood = bairro, radius = raio em km' })
  @IsEnum(DeliveryZoneType)
  type!: DeliveryZoneType;

  @ApiProperty({ example: 'Batel', description: 'Nome da zona (bairro ou descrição do raio)' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: 5.00, description: 'Taxa de entrega em R$' })
  @IsNumber()
  @Min(0)
  fee!: number;

  @ApiPropertyOptional({ example: 3.5, description: 'Raio em km (obrigatório quando type = radius)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  radiusKm?: number;
}
