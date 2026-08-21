import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { TemplatesController } from './templates.controller';
import { ChatService } from './chat.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';

@Module({
  imports: [WhatsAppModule],
  controllers: [ConversationsController, TemplatesController, WhatsAppTemplatesController],
  providers: [ChatService],
  exports: [ChatService], // exportado para que OrdersService possa usar sendAutoMessage (RF57)
})
export class ChatModule {}
