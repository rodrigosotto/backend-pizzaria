import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecipeIngredientDto {
  @ApiProperty({
    example: 'uuid-do-insumo',
    description: 'UUID do insumo de estoque',
  })
  @IsUUID()
  stockItemId: string;

  @ApiProperty({
    example: 0.15,
    description: 'Quantidade do insumo consumida por 1 unidade do produto (ex: 0.15 para 150g)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({
    example: 'kg',
    description: 'Unidade de medida na receita (ex: g, ml, kg, un)',
    maxLength: 10,
  })
  @IsString()
  @MaxLength(10)
  unit: string;
}

export class UpsertRecipeDto {
  @ApiProperty({
    type: [RecipeIngredientDto],
    description: 'Lista completa de ingredientes da receita — substitui todos os existentes',
    example: [
      { stockItemId: 'uuid-farinha', quantity: 0.25, unit: 'kg' },
      { stockItemId: 'uuid-molho', quantity: 0.08, unit: 'kg' },
      { stockItemId: 'uuid-queijo', quantity: 0.15, unit: 'kg' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];
}
