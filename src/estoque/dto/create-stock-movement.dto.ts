import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export enum MovementType {
  entry = 'entry',
  withdrawal = 'withdrawal',
  loss = 'loss',
  adjustment = 'adjustment',
}

export class CreateStockMovementDto {
  @ApiProperty({
    enum: MovementType,
    example: 'entry',
    description: 'entry (entrada) | withdrawal (retirada) | loss (perda) | adjustment (ajuste de inventário)',
  })
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({ example: 5.0, description: 'Para entry/withdrawal/loss: quantidade movimentada. Para adjustment: quantidade absoluta alvo (o delta é calculado automaticamente).' })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({ example: 'Nota fiscal 4521 — Dist. Paulista' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'uuid-do-pedido', description: 'Pedido que originou a movimentação (auto_debit)' })
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
