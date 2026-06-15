import { describe, expect, it, vi } from 'vitest';
import { commitGeneratedModel, GenerationService } from './generation.service';
import type { ArchitectureService } from '../architecture/api';
import type { CamlDocument } from '@cac/caml';

const model: CamlDocument = { camlVersion: '1.0', id: 'arch_GEN1', name: 'Generated', components: [] };

describe('commitGeneratedModel', () => {
  it('commits through the Architecture Service write path and returns the new id', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'arch-1', defaultBranch: 'main', head: 'h0' });
    const commit = vi.fn().mockResolvedValue({ hash: 'h1', parents: ['h0'] });
    const arch = { create, commit } as unknown as ArchitectureService;

    const id = await commitGeneratedModel(arch, model, 'a web app');
    expect(id).toBe('arch-1');
    expect(create).toHaveBeenCalledWith({ name: 'Generated' });
    expect(commit).toHaveBeenCalledWith('arch-1', 'main', expect.objectContaining({ expectedParent: 'h0', model }));
  });
});

describe('proposal lifecycle', () => {
  const svc = new GenerationService();

  it('getProposal throws for an unknown job', () => {
    expect(() => svc.getProposal('nope')).toThrow(/no proposal/);
  });

  it('rejectProposal is a safe no-op for an unknown job', () => {
    expect(svc.rejectProposal('nope')).toEqual({ ok: true });
  });
});
