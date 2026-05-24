import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { DeliverersModule } from '../deliverers/deliverers.module';
import { KdsModule } from '../kds/kds.module';

@Module({
  imports: [DeliverersModule, KdsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
