import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryZoneType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateDeliveryZoneDto {
  @ApiPropertyOptional({ enum: DeliveryZoneType })
  @IsOptional()
  @IsEnum(DeliveryZoneType)
  type?: DeliveryZoneType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  radiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
