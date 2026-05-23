import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DeliverersModule } from '../deliverers/deliverers.module';
import { KdsModule } from '../kds/kds.module';

@Module({
  imports: [DeliverersModule, KdsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
