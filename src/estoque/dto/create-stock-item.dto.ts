import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StockCategory, StockUnit } from '@prisma/client';

export class CreateStockItemDto {
  @ApiProperty({ example: 'Muçarela' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    enum: StockCategory,
    example: 'frios',
    description: 'frios | frutas | oleo | verduras | legumes | fritos | outros',
  })
  @IsEnum(StockCategory)
  category: StockCategory;

  @ApiProperty({
    enum: StockUnit,
    example: 'kg',
    description: 'kg | unit | liter | package',
  })
  @IsEnum(StockUnit)
  unit: StockUnit;

  @ApiProperty({ example: 10.5, description: 'Quantidade atual em estoque' })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 2.0, description: 'Quantidade mínima para alerta (RN04)' })
  @IsNumber()
  @Min(0)
  minQuantity: number;

  @ApiPropertyOptional({ example: 18.90, description: 'Custo unitário (último fornecedor)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUnit?: number;

  @ApiPropertyOptional({ example: 'uuid-do-fornecedor' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
