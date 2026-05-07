import { Module } from '@nestjs/common';
import { DeliverersController } from './deliverers.controller';
import { DeliverersService } from './deliverers.service';
import { DeliveryQueueService } from './delivery-queue.service';
import { DeliveryGateway } from './delivery.gateway';

@Module({
  controllers: [DeliverersController],
  providers: [DeliverersService, DeliveryQueueService, DeliveryGateway],
  exports: [DeliveryQueueService, DeliveryGateway],
})
export class DeliverersModule {}
