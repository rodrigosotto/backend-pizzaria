import { Module } from '@nestjs/common';
import { DeliverersController } from './deliverers.controller';
import { DeliverersService } from './deliverers.service';
import { DeliveryQueueService } from './delivery-queue.service';

@Module({
  controllers: [DeliverersController],
  providers: [DeliverersService, DeliveryQueueService],
  exports: [DeliveryQueueService],
})
export class DeliverersModule {}
