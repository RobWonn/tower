import { access, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentType, type SlashCommandCatalogResponse, type SlashCommandOption, type SlashCommandScope } from '@agent-tower/shared';

interface ParsedMetadata {
  name?: string;
  description?: string;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeInvocationName(value: string): string {
  return value.trim().replace(/^[/$]+/, '');
}

function parseFrontmatter(markdown: string): ParsedMetadata {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return {};

  const metadata: ParsedMetadata = {};
  const lines = match[1].split(/\r?\n/);

  for (const line of lines) {
    const parsed = /^([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line);
    if (!parsed) continue;

    const key = parsed[1];
    const rawValue = stripQuotes(parsed[2]);
    if (!rawValue || rawValue === '|' || rawValue === '>') continue;

    if (key === 'name') metadata.name = rawValue;
    if (key === 'description') metadata.description = rawValue;
  }

  return metadata;
}

function extractBody(markdown: string): string {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) return markdown;
  return markdown.slice(match[0].length);
}

function extractSummary(markdown: string): string | null {
  const lines = extractBody(markdown).split(/\r?\n/);
  const summaryLines: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (summaryLines.length > 0) break;
      continue;
    }

    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }

    if (inFence || line.startsWith('#') || line.startsWith('![') || line.startsWith('<!--')) {
      continue;
    }

    summaryLines.push(line);
  }

  return summaryLines.length > 0 ? summaryLines.join(' ') : null;
}

async function collectSkillFiles(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(skillsDir, entry.name, 'SKILL.md'));
  } catch {
    return [];
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectMarkdownFiles(fullPath));
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

function toSlashCommand(name: string): string {
  return `/${normalizeInvocationName(name)}`;
}

function buildCommandNameFromFile(commandsDir: string, filePath: string): string {
  const relativePath = path.relative(commandsDir, filePath).replace(/\.md$/i, '');
  const segments = relativePath
    .split(path.sep)
    .map((segment) => normalizeInvocationName(segment))
    .filter(Boolean);
  return toSlashCommand(segments.join(':'));
}

function createDiscoveredOption(params: {
  command: string;
  markdown: string;
  fallbackName: string;
  fallbackDescription: string;
  kind: 'command' | 'skill';
  scope: SlashCommandScope;
}): SlashCommandOption {
  const metadata = parseFrontmatter(params.markdown);
  const description = metadata.description || extractSummary(params.markdown) || params.fallbackDescription;

  return {
    command: params.command || toSlashCommand(metadata.name || params.fallbackName),
    description,
    kind: params.kind,
    scope: params.scope,
  };
}

async function discoverClaudeSkills(skillsDir: string, scope: SlashCommandScope): Promise<SlashCommandOption[]> {
  const skillFiles = await collectSkillFiles(skillsDir);
  const commands: SlashCommandOption[] = [];

  for (const skillFile of skillFiles) {
    try {
      const markdown = await readFile(skillFile, 'utf-8');
      const fallbackName = path.basename(path.dirname(skillFile));
      commands.push(createDiscoveredOption({
        command: toSlashCommand(parseFrontmatter(markdown).name || fallbackName),
        markdown,
        fallbackName,
        fallbackDescription: `${scope === 'project' ? 'Project' : 'User'} Claude skill`,
        kind: 'skill',
        scope,
      }));
    } catch {
      continue;
    }
  }

  return commands;
}

async function discoverClaudeCommands(commandsDir: string, scope: SlashCommandScope): Promise<SlashCommandOption[]> {
  const commandFiles = await collectMarkdownFiles(commandsDir);
  const commands: SlashCommandOption[] = [];

  for (const commandFile of commandFiles) {
    try {
      const markdown = await readFile(commandFile, 'utf-8');
      const metadata = parseFrontmatter(markdown);
      const fallbackName = path.basename(commandFile, path.extname(commandFile));
      commands.push(createDiscoveredOption({
        command: metadata.name
          ? toSlashCommand(metadata.name)
          : buildCommandNameFromFile(commandsDir, commandFile),
        markdown,
        fallbackName,
        fallbackDescription: `${scope === 'project' ? 'Project' : 'User'} Claude command`,
        kind: 'command',
        scope,
      }));
    } catch {
      continue;
    }
  }

  return commands;
}

function dedupeCommands(commands: SlashCommandOption[]): SlashCommandOption[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = normalizeInvocationName(command.command).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function discoverClaudeSlashCommands(workingDir?: string): Promise<SlashCommandOption[]> {
  const commands: SlashCommandOption[] = [];

  if (workingDir) {
    const projectClaudeDir = path.join(path.resolve(workingDir), '.claude');
    commands.push(...await discoverClaudeCommands(path.join(projectClaudeDir, 'commands'), 'project'));
    commands.push(...await discoverClaudeSkills(path.join(projectClaudeDir, 'skills'), 'project'));
  }

  const userClaudeDir = path.join(os.homedir(), '.claude');
  commands.push(...await discoverClaudeCommands(path.join(userClaudeDir, 'commands'), 'user'));
  commands.push(...await discoverClaudeSkills(path.join(userClaudeDir, 'skills'), 'user'));

  return dedupeCommands(commands);
}

async function findRepositoryRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);

  while (true) {
    if (await exists(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function discoverCodexSkillRoots(workingDir?: string): Promise<Array<{ root: string; scope: SlashCommandScope }>> {
  const roots: Array<{ root: string; scope: SlashCommandScope }> = [
    { root: path.join(os.homedir(), '.agents', 'skills'), scope: 'user' },
  ];

  if (!workingDir) return roots;

  const resolved = path.resolve(workingDir);
  const repoRoot = await findRepositoryRoot(resolved);
  const projectRoot = repoRoot ?? resolved;

  roots.unshift({ root: path.join(projectRoot, '.agents', 'skills'), scope: 'project' });

  const seen = new Set<string>();
  return roots.filter(({ root }) => {
    if (seen.has(root)) return false;
    seen.add(root);
    return true;
  });
}

async function discoverCodexSkills(workingDir?: string): Promise<SlashCommandOption[]> {
  const roots = await discoverCodexSkillRoots(workingDir);
  const commands: SlashCommandOption[] = [];

  for (const { root, scope } of roots) {
    const skillFiles = await collectSkillFiles(root);
    for (const skillFile of skillFiles) {
      try {
        const markdown = await readFile(skillFile, 'utf-8');
        const fallbackName = path.basename(path.dirname(skillFile));
        const metadata = parseFrontmatter(markdown);
        commands.push({
          command: `$${normalizeInvocationName(metadata.name || fallbackName)}`,
          description: metadata.description || extractSummary(markdown) || `${scope === 'project' ? 'Project' : 'User'} Codex skill`,
          kind: 'skill',
          scope,
        });
      } catch {
        continue;
      }
    }
  }

  return dedupeCommands(commands);
}

export async function discoverSlashCommandCatalog(
  agentType?: string | null,
  workingDir?: string
): Promise<SlashCommandCatalogResponse> {
  switch (agentType) {
    case AgentType.CLAUDE_CODE:
      return { commands: await discoverClaudeSlashCommands(workingDir) };
    default:
      return { commands: [] };
  }
}

export async function discoverSkillCatalog(
  agentType?: string | null,
  workingDir?: string
): Promise<SlashCommandCatalogResponse> {
  switch (agentType) {
    case AgentType.CODEX:
      return { commands: await discoverCodexSkills(workingDir) };
    default:
      return { commands: [] };
  }
}
