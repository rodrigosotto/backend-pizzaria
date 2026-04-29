import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ComboItemDto {
  @ApiProperty({ example: 'uuid-do-produto' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({
    example: 'uuid-do-tamanho',
    description: 'Tamanho especifico do produto (opcional)',
  })
  @IsOptional()
  @IsUUID()
  productSizeId?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateComboDto {
  @ApiProperty({ example: 'Combo Familia' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '2 pizzas grandes + 1 refrigerante 2L' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 89.9, description: 'Preco especial do combo' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({
    type: [ComboItemDto],
    description: 'Produtos que compoem o combo',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ComboItemDto)
  items!: ComboItemDto[];

  @ApiPropertyOptional({
    example: '2026-05-01T00:00:00Z',
    description: 'Inicio da vigencia (null = sempre valido)',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2026-05-31T23:59:59Z',
    description: 'Fim da vigencia (null = sem expiracao)',
  })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
