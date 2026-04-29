import { Module } from '@nestjs/common';
import { EstoqueService } from './estoque.service';
import { SuppliersController } from './suppliers.controller';
import { StockItemsController } from './stock-items.controller';

@Module({
  controllers: [SuppliersController, StockItemsController],
  providers: [EstoqueService],
  exports: [EstoqueService],
})
export class EstoqueModule {}
