import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdatePizzeriaConfigDto {
  @ApiPropertyOptional({ description: 'Se a pizzaria está aceitando pedidos' })
  @IsOptional()
  @IsBoolean()
  acceptingOrders?: boolean;

  @ApiPropertyOptional({ description: 'Tempo estimado de entrega em minutos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDelivery?: number;

  @ApiPropertyOptional({ description: 'Tempo estimado de retirada em minutos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedPickup?: number;

  @ApiPropertyOptional({
    description: 'Percentual de taxa de serviço (ex: 10 = 10%)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceFeePct?: number;

  @ApiPropertyOptional({
    description: 'A quem a taxa de serviço se aplica',
    enum: ['all', 'delivery', 'table', 'none'],
  })
  @IsOptional()
  @IsString()
  serviceFeeAppliesTo?: string;

  @ApiPropertyOptional({ description: 'Valor mínimo para pedido de entrega' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minDeliveryOrder?: number;

  @ApiPropertyOptional({ description: 'Valor para frete grátis' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeDeliveryAbove?: number;

  @ApiPropertyOptional({
    description: 'Regra de precificação para pizza meio a meio',
    enum: ['most_expensive', 'average'],
  })
  @IsOptional()
  @IsString()
  pizzaPricingRule?: string;

  @ApiPropertyOptional({
    description: 'Métodos de pagamento aceitos',
    example: ['cash', 'pix', 'credit', 'debit'],
  })
  @IsOptional()
  paymentMethods?: string[];

  @ApiPropertyOptional({
    description: 'Horário de funcionamento por dia da semana',
    example: { mon: { open: '11:00', close: '23:00' }, tue: null },
  })
  @IsOptional()
  businessHours?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Mensagens automáticas para status de pedido',
  })
  @IsOptional()
  autoMessages?: Record<string, unknown>;
}
