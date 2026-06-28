import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { StockGateway } from './stock.gateway';

describe('StockGateway', () => {
  let gateway: StockGateway;
  let mockEmit: ReturnType<typeof jest.fn>;
  let mockTo: ReturnType<typeof jest.fn>;

  beforeEach(async () => {
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });

    const module: TestingModule = await Test.createTestingModule({
      providers: [StockGateway],
    }).compile();

    gateway = module.get<StockGateway>(StockGateway);
    (gateway as any).server = { to: mockTo };
  });

  it('emite evento stock:alert na sala da pizzaria', () => {
    const alerts = [
      { id: 'stock-1', name: 'Farinha', quantity: 1, minQuantity: 5, unit: 'kg' },
    ];

    gateway.notifyStockAlert('pizzeria-123', alerts);

    expect(mockTo).toHaveBeenCalledWith('pizzeria:pizzeria-123');
    expect(mockEmit).toHaveBeenCalledWith('stock:alert', {
      pizzariaId: 'pizzeria-123',
      alerts,
    });
  });

  it('emite multiplos alertas em uma unica chamada', () => {
    const alerts = [
      { id: 's1', name: 'Queijo', quantity: 0, minQuantity: 2, unit: 'kg' },
      { id: 's2', name: 'Presunto', quantity: 0.5, minQuantity: 1, unit: 'kg' },
    ];

    gateway.notifyStockAlert('pizzeria-456', alerts);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const callArgs = mockEmit.mock.calls[0] as [string, any];
    expect((callArgs[1] as any).alerts).toHaveLength(2);
  });

  it('usa a sala correta para cada pizzaria', () => {
    gateway.notifyStockAlert('pizzeria-A', []);
    gateway.notifyStockAlert('pizzeria-B', []);

    expect(mockTo).toHaveBeenNthCalledWith(1, 'pizzeria:pizzeria-A');
    expect(mockTo).toHaveBeenNthCalledWith(2, 'pizzeria:pizzeria-B');
  });
});
