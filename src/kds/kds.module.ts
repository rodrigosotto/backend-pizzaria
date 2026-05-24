import { Module } from '@nestjs/common';
import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';
import { KdsGateway } from './kds.gateway';

@Module({
  controllers: [KdsController],
  providers: [KdsService, KdsGateway],
  exports: [KdsService],
})
export class KdsModule {}
