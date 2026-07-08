import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CepService } from './cep.service';

describe('CepService', () => {
  let service: CepService;
  let httpService: { get: ReturnType<typeof jest.fn> };

  beforeEach(async () => {
    httpService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CepService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<CepService>(CepService);
  });

  it('retorna endereço formatado para CEP válido', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          cep: '01310-100',
          logradouro: 'Avenida Paulista',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        },
      }),
    );

    const result = await service.lookup('01310100');

    expect(result).toEqual({
      zipCode: '01310100',
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
  });

  it('lança BadRequestException para CEP com menos de 8 dígitos', async () => {
    await expect(service.lookup('1234')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException para CEP com letras (< 8 dígitos após limpeza)', async () => {
    await expect(service.lookup('abc')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança NotFoundException quando ViaCEP retorna erro', async () => {
    httpService.get.mockReturnValue(of({ data: { erro: true } }));

    await expect(service.lookup('99999999')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança BadRequestException quando chamada HTTP falha', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

    await expect(service.lookup('01310100')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita CEP com hífen', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          cep: '01310-100',
          logradouro: 'Av. Paulista',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        },
      }),
    );

    const result = await service.lookup('01310-100');
    expect(result.zipCode).toBe('01310100');
  });
});
