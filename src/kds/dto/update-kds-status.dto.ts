import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { KdsItemStatus } from '@prisma/client';

export class UpdateKdsStatusDto {
  @ApiProperty({
    enum: KdsItemStatus,
    description: 'Novo status: pending → preparing → done',
  })
  @IsEnum(KdsItemStatus)
  status!: KdsItemStatus;
}
