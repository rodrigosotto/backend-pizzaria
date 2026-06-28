import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface ViaCepResponse {
  erro?: boolean;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  cep: string;
}

@Injectable()
export class CepService {
  constructor(private readonly http: HttpService) {}

  async lookup(zip: string) {
    const cleaned = zip.replace(/\D/g, '');

    if (cleaned.length !== 8) {
      throw new BadRequestException('CEP deve conter exatamente 8 dígitos');
    }

    let data: ViaCepResponse;
    try {
      const response = await firstValueFrom(
        this.http.get<ViaCepResponse>(`https://viacep.com.br/ws/${cleaned}/json/`),
      );
      data = response.data;
    } catch {
      throw new BadRequestException('Erro ao consultar o serviço de CEP. Tente novamente.');
    }

    if (data.erro) {
      throw new NotFoundException(`CEP "${cleaned}" não encontrado`);
    }

    return {
      zipCode: data.cep.replace('-', ''),
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
    };
  }
}
