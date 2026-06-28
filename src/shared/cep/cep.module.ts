import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';

@Module({
  imports: [HttpModule],
  controllers: [CepController],
  providers: [CepService],
  exports: [CepService],
})
export class CepModule {}
