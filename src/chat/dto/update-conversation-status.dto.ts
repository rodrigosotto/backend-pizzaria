import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const CHAT_CONVERSATION_STATUSES = ['open', 'pending', 'closed'] as const;
export type ChatConversationStatus = (typeof CHAT_CONVERSATION_STATUSES)[number];

export class UpdateConversationStatusDto {
  @ApiProperty({ enum: CHAT_CONVERSATION_STATUSES })
  @IsIn(CHAT_CONVERSATION_STATUSES)
  status!: ChatConversationStatus;
}
