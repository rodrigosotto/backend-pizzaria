import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendTemplateMessageDto {
  @ApiProperty({ example: 'uuid-do-template', description: 'UUID do template a ser enviado como mensagem' })
  @IsUUID()
  templateId: string;
}
