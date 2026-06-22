import { mapChatwootAgentRole } from './agent-provision.util';

describe('mapChatwootAgentRole (provisionamento via API de conta)', () => {
  it('mapeia admin para administrator', () => {
    expect(mapChatwootAgentRole('admin')).toBe('administrator');
  });

  it('mapeia super_admin para administrator', () => {
    expect(mapChatwootAgentRole('super_admin')).toBe('administrator');
  });

  it('mapeia operator para agent', () => {
    expect(mapChatwootAgentRole('operator')).toBe('agent');
  });
});
