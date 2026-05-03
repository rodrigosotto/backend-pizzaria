import { Module } from '@nestjs/common';
import { DeliverersController } from './deliverers.controller';
import { DeliverersService } from './deliverers.service';

@Module({
  controllers: [DeliverersController],
  providers: [DeliverersService],
})
export class DeliverersModule {}
