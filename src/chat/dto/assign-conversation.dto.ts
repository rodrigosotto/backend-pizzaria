import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignConversationDto {
  @ApiProperty({ description: 'ID do usuário operacional que receberá a conversa' })
  @IsUUID()
  userId!: string;
}
