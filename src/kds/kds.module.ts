import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';
import { KdsGateway } from './kds.gateway';

@Module({
  imports: [
    // JwtModule necessário para o gateway validar tokens no handleConnection
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [KdsController],
  providers: [KdsService, KdsGateway],
  exports: [KdsService],
})
export class KdsModule {}
