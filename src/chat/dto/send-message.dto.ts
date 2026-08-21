import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Olá! Seu pedido está a caminho 🛵',
    description: 'Conteúdo da mensagem. Suporta texto e emojis (RF61).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
