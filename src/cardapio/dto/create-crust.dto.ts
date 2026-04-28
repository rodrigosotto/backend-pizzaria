import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCrustDto {
  @ApiProperty({ example: 'Catupiry' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Preço extra para tamanho P' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPriceS?: number;

  @ApiPropertyOptional({ example: 5, default: 0, description: 'Preço extra para tamanho M' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPriceM?: number;

  @ApiPropertyOptional({ example: 7, default: 0, description: 'Preço extra para tamanho G' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPriceL?: number;

  @ApiPropertyOptional({ example: 9, default: 0, description: 'Preço extra para tamanho GG' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPriceXl?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
