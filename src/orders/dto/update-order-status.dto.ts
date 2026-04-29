import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    example: 'accepted',
    description: `Transições válidas:
- new → accepted | cancelled
- accepted → preparing | cancelled
- preparing → ready | cancelled
- ready → delivering (só delivery) | done | cancelled
- delivering → done | cancelled`,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({
    example: 35,
    description: 'Tempo estimado em minutos — atualizado ao aceitar o pedido',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedTime?: number;
}
