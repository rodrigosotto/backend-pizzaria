import { Module } from '@nestjs/common';
import { ConfigPizzeriaController } from './config-pizzeria.controller';
import { ConfigPizzeriaService } from './config-pizzeria.service';

@Module({
  controllers: [ConfigPizzeriaController],
  providers: [ConfigPizzeriaService],
})
export class ConfigPizzeriaModule {}
