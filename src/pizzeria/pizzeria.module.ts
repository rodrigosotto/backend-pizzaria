import { Module } from '@nestjs/common';
import { PizzeriaService } from './pizzeria.service';
import { PizzeriaController } from './pizzeria.controller';

@Module({
  controllers: [PizzeriaController],
  providers: [PizzeriaService],
  exports: [PizzeriaService],
})
export class PizzeriaModule {}
