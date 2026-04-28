import { Module } from '@nestjs/common';
import { CardapioService } from './cardapio.service';
import { CategoriesController } from './categories.controller';
import { ProductsController } from './products.controller';
import { CrustsController } from './crusts.controller';
import { PublicMenuController } from './public-menu.controller';
import { CombosController } from './combos.controller';

@Module({
  controllers: [CategoriesController, ProductsController, CrustsController, PublicMenuController, CombosController],
  providers: [CardapioService],
})
export class CardapioModule {}
