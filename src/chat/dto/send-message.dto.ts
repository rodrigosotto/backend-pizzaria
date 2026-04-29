import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const SENDER_TYPES = ['attendant', 'customer', 'system'] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export class SendMessageDto {
  @ApiProperty({
    example: 'Olá! Seu pedido está a caminho 🛵',
    description: 'Conteúdo da mensagem. Suporta texto e emojis (RF61).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    enum: SENDER_TYPES,
    default: 'attendant',
    description:
      '`attendant` = atendente da pizzaria (padrão) | `customer` = cliente | `system` = mensagem automática do sistema',
  })
  @IsOptional()
  @IsIn(SENDER_TYPES)
  senderType?: SenderType;

  @ApiPropertyOptional({
    default: false,
    description: 'Marca a mensagem como automática (ex: confirmação de pedido — RF57)',
  })
  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;
}
