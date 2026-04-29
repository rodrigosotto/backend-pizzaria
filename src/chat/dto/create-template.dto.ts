import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    example: 'Pedido confirmado',
    description: 'Título interno do template (visível apenas para o atendente)',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title: string;

  @ApiProperty({
    example: 'Olá! Seu pedido foi confirmado e está sendo preparado. Tempo estimado: {{estimatedTime}} minutos. 🍕',
    description: 'Conteúdo do template. Suporta variáveis entre {{ }} para substituição manual.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
