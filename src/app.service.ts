import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Pizza API — Sistema de Gestão de Pizzarias';
  }
}
