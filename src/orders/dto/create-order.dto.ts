import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '@prisma/client';

export class OrderFlavorDto {
  @ApiProperty({ example: 'uuid-do-produto-sabor', description: 'ID do produto que representa este sabor' })
  @IsUUID()
  productId: string;
}

export class CreateOrderItemDto {
  @ApiProperty({ example: 'uuid-do-produto' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ example: 'uuid-do-tamanho', description: 'Obrigatório para produtos com tamanhos' })
  @IsOptional()
  @IsUUID()
  productSizeId?: string;

  @ApiPropertyOptional({ example: 'uuid-da-borda', description: 'Borda recheada opcional (apenas pizzas)' })
  @IsOptional()
  @IsUUID()
  crustId?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    type: [OrderFlavorDto],
    description: 'Sabores para pizzas fracionadas. A quantidade máxima é definida em Product.maxFlavors. O preço é calculado via flavorPriceRule (RN01).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderFlavorDto)
  flavors?: OrderFlavorDto[];

  @ApiPropertyOptional({ example: 'Sem cebola, borda extra crocante' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({
    enum: OrderType,
    example: 'delivery',
    description: 'Tipo do pedido: delivery (entrega), table (mesa), counter (balcão)',
  })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiPropertyOptional({ example: 'uuid-do-cliente', description: 'Cliente vinculado (permite acumular fidelidade)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: 'uuid-da-mesa', description: 'Obrigatório para pedidos do tipo table' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({ example: 'uuid-da-sessao', description: 'Sessão de mesa em aberto' })
  @IsOptional()
  @IsUUID()
  tableSessionId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-endereco', description: 'Endereço de entrega — obrigatório para delivery' })
  @IsOptional()
  @IsUUID()
  deliveryAddressId?: string;

  @ApiPropertyOptional({
    example: 'PROMO10',
    description: 'Código de cupom de desconto (RN06: validado no servidor — vigência, mínimo, limite de usos)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  @ApiPropertyOptional({ example: 'Entregar no portão. Apartamento 42.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ example: 40, description: 'Tempo estimado de preparo/entrega em minutos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedTime?: number;

  @ApiPropertyOptional({ description: 'UUID do pedido pai — para sub-pedidos criados durante o preparo' })
  @IsOptional()
  @IsUUID()
  parentOrderId?: string;

  @ApiProperty({
    type: [CreateOrderItemDto],
    description: 'Itens do pedido. Mínimo 1 item.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
