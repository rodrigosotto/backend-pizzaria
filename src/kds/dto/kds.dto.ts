import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { KdsItemStatus } from '@prisma/client';

export class UpdateKdsItemStatusDto {
  @ApiProperty({
    enum: KdsItemStatus,
    example: 'preparing',
    description: 'Novo status do item: pending → preparing → done',
  })
  @IsEnum(KdsItemStatus)
  status: KdsItemStatus;
}
