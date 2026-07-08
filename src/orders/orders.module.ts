import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { DeliverersModule } from '../deliverers/deliverers.module';
import { KdsModule } from '../kds/kds.module';
import { EstoqueModule } from '../estoque/estoque.module';

@Module({
  imports: [DeliverersModule, KdsModule, EstoqueModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService],
})
export class OrdersModule {}
