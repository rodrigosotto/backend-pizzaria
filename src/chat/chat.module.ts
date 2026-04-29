import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { TemplatesController } from './templates.controller';
import { ChatService } from './chat.service';

@Module({
  controllers: [ConversationsController, TemplatesController],
  providers: [ChatService],
  exports: [ChatService], // exportado para que OrdersService possa usar sendAutoMessage (RF57)
})
export class ChatModule {}
