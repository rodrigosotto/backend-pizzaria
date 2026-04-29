import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ example: 'uuid-do-cliente', description: 'UUID do cliente com quem iniciar a conversa' })
  @IsUUID()
  customerId: string;
}
