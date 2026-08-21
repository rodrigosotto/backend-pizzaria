import { WhatsAppClient } from './whatsapp.client';
import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService', () => {
  it('delegates text delivery to the dedicated client using tenant credentials', async () => {
    const client = { sendText: jest.fn().mockResolvedValue({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] }) };
    const service = new WhatsAppService(client as unknown as WhatsAppClient);
    const credentials = { phoneNumberId: 'phone-1', accessToken: 'tenant-token' };
    const input = { to: '5511999999999', body: 'Olá' };

    await expect(service.sendText(credentials, input)).resolves.toEqual({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] });
    expect(client.sendText).toHaveBeenCalledWith(credentials, input);
  });
});
