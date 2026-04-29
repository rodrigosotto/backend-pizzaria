import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order.dto';

export class UpdateOrderItemsDto {
  @ApiProperty({
    type: [CreateOrderItemDto],
    description: 'Lista completa e atualizada dos itens do pedido. Substitui todos os itens anteriores. Só permitido quando status = accepted (RF09).',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
