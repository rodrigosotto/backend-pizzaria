import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { CepService } from './cep.service';

@ApiTags('Addresses')
@Controller('addresses')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Public()
  @Get('cep/:zip')
  @ApiOperation({
    summary: 'Consultar endereço por CEP (RF46)',
    description: 'Retorna logradouro, bairro e cidade via ViaCEP. Endpoint público.',
  })
  @ApiParam({ name: 'zip', example: '01310100', description: 'CEP com ou sem hífen' })
  lookup(@Param('zip') zip: string) {
    return this.cepService.lookup(zip);
  }
}
