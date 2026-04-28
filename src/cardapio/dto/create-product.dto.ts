import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FlavorPriceRule } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ example: 'uuid-da-categoria' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'Margherita' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Molho de tomate, mussarela e manjericao' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true, default: false, description: 'E uma pizza (exibe sabores/bordas)' })
  @IsOptional()
  @IsBoolean()
  isPizza?: boolean;

  @ApiPropertyOptional({ example: 2, description: 'Maximo de sabores (apenas para pizzas)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxFlavors?: number;

  @ApiPropertyOptional({
    enum: FlavorPriceRule,
    default: 'highest',
    description: 'Regra de preco para pizzas fracionadas (RN01): highest = sabor mais caro, average = media, fixed = preco fixo do tamanho',
  })
  @IsOptional()
  @IsEnum(FlavorPriceRule)
  flavorPriceRule?: FlavorPriceRule;

  @ApiPropertyOptional({ example: 30, description: 'Tempo de preparo em minutos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  preparationTime?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
