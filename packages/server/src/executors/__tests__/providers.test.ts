import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderBackupFile } from '@agent-tower/shared';
import { AgentType } from '../../types/index.js';
import {
  createProviderBackup,
  getAllProviders,
  importProvidersFromBackup,
  previewProviderImport,
  reloadProviders,
} from '../providers.js';

const originalDataDir = process.env.AGENT_TOWER_DATA_DIR;

let tempDataDir = '';

function writeUserProviders(providers: unknown[]) {
  fs.writeFileSync(
    path.join(tempDataDir, 'providers.json'),
    JSON.stringify({ providers }, null, 2),
    'utf-8'
  );
}

describe('providers backup/import', () => {
  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tower-providers-'));
    process.env.AGENT_TOWER_DATA_DIR = tempDataDir;
    reloadProviders();
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.AGENT_TOWER_DATA_DIR;
    } else {
      process.env.AGENT_TOWER_DATA_DIR = originalDataDir;
    }

    if (tempDataDir) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }

    reloadProviders();
  });

  it('exports only user-level provider data', () => {
    writeUserProviders([
      {
        id: 'codex-default',
        name: 'Codex Proxy',
        agentType: AgentType.CODEX,
        env: { OPENAI_API_KEY: 'sk-proxy' },
        config: { fullAuto: false, model: 'gpt-5.3-codex' },
        settings: 'model = "gpt-5.3-codex"',
        isDefault: true,
      },
      {
        id: 'custom-codex',
        name: 'Codex Local',
        agentType: AgentType.CODEX,
        env: { OPENAI_API_KEY: 'sk-local' },
        config: { fullAuto: true },
        isDefault: false,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ]);

    reloadProviders();

    const backup = createProviderBackup();

    expect(backup.kind).toBe('provider-backup');
    expect(backup.providers.map(provider => provider.id)).toEqual(['codex-default', 'custom-codex']);
    expect(backup.providers.every(provider => provider.builtIn === undefined)).toBe(true);
  });

  it('previews and imports create/overwrite/skip actions correctly', () => {
    writeUserProviders([
      {
        id: 'same-provider',
        name: 'Same Provider',
        agentType: AgentType.CODEX,
        env: { OPENAI_API_KEY: 'same-key' },
        config: { fullAuto: true },
        isDefault: false,
        createdAt: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'overwrite-provider',
        name: 'Claude Old',
        agentType: AgentType.CLAUDE_CODE,
        env: { ANTHROPIC_API_KEY: 'old-key' },
        config: { dangerouslySkipPermissions: true },
        isDefault: false,
      },
    ]);

    reloadProviders();

    const backup: ProviderBackupFile = {
      version: 1,
      kind: 'provider-backup',
      exportedAt: '2026-03-23T10:00:00.000Z',
      mode: 'full',
      providers: [
        {
          id: 'same-provider',
          name: 'Same Provider',
          agentType: AgentType.CODEX,
          env: { OPENAI_API_KEY: 'same-key' },
          config: { fullAuto: true },
          isDefault: false,
        },
        {
          id: 'overwrite-provider',
          name: 'Claude New',
          agentType: AgentType.CLAUDE_CODE,
          env: { ANTHROPIC_API_KEY: 'new-key' },
          config: { dangerouslySkipPermissions: false },
          isDefault: true,
        },
        {
          id: 'new-provider',
          name: 'Gemini Team',
          agentType: AgentType.GEMINI_CLI,
          env: { GEMINI_API_KEY: 'new-provider-key' },
          config: { yolo: false },
          isDefault: false,
          createdAt: '2026-03-23T11:00:00.000Z',
        },
      ],
    };

    const preview = previewProviderImport(backup);
    expect(preview.summary).toEqual({
      create: 1,
      overwrite: 1,
      skip: 1,
    });

    const result = importProvidersFromBackup(backup);
    expect(result.summary).toEqual(preview.summary);

    const providers = getAllProviders();
    expect(providers.find(provider => provider.id === 'new-provider')?.name).toBe('Gemini Team');
    expect(providers.find(provider => provider.id === 'overwrite-provider')?.env).toEqual({
      ANTHROPIC_API_KEY: 'new-key',
    });
    expect(providers.find(provider => provider.id === 'overwrite-provider')?.isDefault).toBe(true);
    expect(providers.find(provider => provider.id === 'claude-code-default')?.isDefault).toBe(false);
    expect(providers.find(provider => provider.id === 'same-provider')?.name).toBe('Same Provider');
  });
});
