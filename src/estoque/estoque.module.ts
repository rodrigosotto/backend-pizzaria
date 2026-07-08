import { Module } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { SuppliersController } from './suppliers.controller';
import { StockItemsController } from './stock-items.controller';
import { StockGateway } from './stock.gateway';

@Module({
  controllers: [SuppliersController, StockItemsController],
  providers: [EstoqueService, StockGateway],
  exports: [EstoqueService, StockGateway],
})
export class EstoqueModule {}
