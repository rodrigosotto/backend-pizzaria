import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductSizeDto {
  @ApiProperty({ example: 'Grande (35cm)' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  sizeLabel: string;

  @ApiProperty({ example: 49.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 2, description: 'Máximo de sabores neste tamanho' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxFlavors?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
