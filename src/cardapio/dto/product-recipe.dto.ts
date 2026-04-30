import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID, IsNumber, IsPositive, Min } from 'class-validator';

export class UpsertRecipeItemDto {
  @ApiProperty({ example: 'uuid-do-stock-item', description: 'UUID do insumo de estoque' })
  @IsUUID()
  stockItemId!: string;

  @ApiProperty({
    example: 0.15,
    description: 'Quantidade do insumo consumida por unidade do produto (ex: 0.15 kg de muçarela por pizza)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(0.001)
  quantity!: number;
}
