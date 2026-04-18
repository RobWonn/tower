/**
 * Clash Service — manages the local mihomo/clash proxy via clashctl shell commands
 * and the mihomo RESTful API (http://127.0.0.1:{apiPort}).
 *
 * Designed to work with https://github.com/nelvko/clash-for-linux-install
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Paths (mirroring clashctl common.sh)
// ---------------------------------------------------------------------------
const CLASH_BASE_DIR = `${process.env.HOME}/clashctl`;
const RESOURCES_DIR = `${CLASH_BASE_DIR}/resources`;
const BIN_YQ = `${CLASH_BASE_DIR}/bin/yq`;
const BIN_MIHOMO = `${CLASH_BASE_DIR}/bin/mihomo`;
const CONFIG_RUNTIME = `${RESOURCES_DIR}/runtime.yaml`;
const CONFIG_MIXIN = `${RESOURCES_DIR}/mixin.yaml`;
const CONFIG_BASE = `${RESOURCES_DIR}/config.yaml`;
const PROFILES_META = `${RESOURCES_DIR}/profiles.yaml`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function shell(cmd: string, timeout = 15_000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err: any) {
    throw new Error(err.stderr?.trim() || err.message);
  }
}

function yq(expr: string, file: string): string {
  return shell(`${BIN_YQ} '${expr}' '${file}'`);
}

function mihomoApiUrl(): { url: string; secret: string } {
  try {
    const ext = yq('.external-controller // ""', CONFIG_RUNTIME);
    const secret = yq('.secret // ""', CONFIG_RUNTIME);
    const host = ext.startsWith('0.0.0.0') ? ext.replace('0.0.0.0', '127.0.0.1') : ext;
    return { url: `http://${host || '127.0.0.1:9090'}`, secret };
  } catch {
    return { url: 'http://127.0.0.1:9090', secret: '' };
  }
}

async function mihomoGet(path: string): Promise<any> {
  const { url, secret } = mihomoApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;
  const resp = await fetch(`${url}${path}`, { headers });
  if (!resp.ok) throw new Error(`mihomo API ${path}: ${resp.status}`);
  return resp.json();
}

async function mihomoPut(path: string, body: object): Promise<any> {
  const { url, secret } = mihomoApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;
  const resp = await fetch(`${url}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`mihomo API PUT ${path}: ${resp.status}`);
  return resp.text();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClashInstallStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  mixedPort?: number;
  apiPort?: string;
}

export interface ClashSubscription {
  id: number;
  url: string;
  path: string;
}

export interface ClashProxyNode {
  name: string;
  type: string;
  alive: boolean;
  history: Array<{ delay: number }>;
}

export interface ClashProxyGroup {
  name: string;
  type: string;
  now: string;
  all: string[];
}

export class ClashService {
  /** Check if clashctl is installed and mihomo is running */
  static getStatus(): ClashInstallStatus {
    const installed = existsSync(BIN_MIHOMO) && existsSync(BIN_YQ);
    if (!installed) return { installed: false, running: false };

    let running = false;
    try {
      const ps = shell('pgrep -f "mihomo.*runtime.yaml" || true');
      running = ps.length > 0;
    } catch { /* not running */ }

    let version: string | undefined;
    try { version = shell(`${BIN_MIHOMO} -v 2>/dev/null | head -1`); } catch { /* ignore */ }

    let mixedPort: number | undefined;
    let apiPort: string | undefined;
    try {
      mixedPort = parseInt(yq('.mixed-port // 0', CONFIG_RUNTIME), 10) || undefined;
      apiPort = yq('.external-controller // ""', CONFIG_RUNTIME) || undefined;
    } catch { /* ignore */ }

    return { installed, running, version, mixedPort, apiPort };
  }

  /** Start mihomo */
  static start(): string {
    try {
      shell(`sudo bash -c 'nohup ${BIN_MIHOMO} -d ${RESOURCES_DIR} -f ${CONFIG_RUNTIME} >> ${RESOURCES_DIR}/mihomo.log 2>&1 &'`);
      shell('sleep 1');
      return 'started';
    } catch (e: any) {
      throw new Error(`Failed to start mihomo: ${e.message}`);
    }
  }

  /** Stop mihomo */
  static stop(): string {
    try {
      shell('sudo pkill -9 -f "mihomo" || true');
      return 'stopped';
    } catch (e: any) {
      throw new Error(`Failed to stop mihomo: ${e.message}`);
    }
  }

  /** List subscriptions from profiles.yaml */
  static listSubscriptions(): { use: number; profiles: ClashSubscription[] } {
    if (!existsSync(PROFILES_META)) return { use: 0, profiles: [] };
    try {
      const useId = parseInt(yq('.use // 0', PROFILES_META), 10);
      const count = parseInt(yq('.profiles // [] | length', PROFILES_META), 10);
      const profiles: ClashSubscription[] = [];
      for (let i = 0; i < count; i++) {
        const id = parseInt(yq(`.profiles[${i}].id`, PROFILES_META), 10);
        const url = yq(`.profiles[${i}].url`, PROFILES_META);
        const path = yq(`.profiles[${i}].path`, PROFILES_META);
        profiles.push({ id, url, path });
      }
      return { use: useId, profiles };
    } catch {
      return { use: 0, profiles: [] };
    }
  }

  /** Add a subscription URL */
  static addSubscription(url: string): { id: number } {
    const ua = 'clash-verge/v2.4.0';
    const tempFile = `${RESOURCES_DIR}/temp.yaml`;

    shell(`curl -sf --insecure -L --max-time 30 --user-agent '${ua}' -o '${tempFile}' '${url}'`, 35_000);

    const valid = shell(`${BIN_MIHOMO} -d ${RESOURCES_DIR} -f ${tempFile} -t 2>&1 && echo OK || echo FAIL`);
    if (!valid.includes('OK')) throw new Error('Subscription config is invalid');

    const nextId = parseInt(yq('.profiles // [] | (map(.id) | max) // 0 | . + 1', PROFILES_META), 10);
    const profilePath = `${RESOURCES_DIR}/profiles/${nextId}.yaml`;

    shell(`mkdir -p ${RESOURCES_DIR}/profiles`);
    shell(`mv '${tempFile}' '${profilePath}'`);
    shell(`${BIN_YQ} -i '.profiles = (.profiles // []) + [{"id": ${nextId}, "path": "${profilePath}", "url": "${url}"}]' '${PROFILES_META}'`);

    return { id: nextId };
  }

  /** Delete a subscription */
  static deleteSubscription(id: number): void {
    const path = yq(`.profiles[] | select(.id == ${id}) | .path`, PROFILES_META);
    shell(`rm -f '${path}'`);
    shell(`${BIN_YQ} -i 'del(.profiles[] | select(.id == ${id}))' '${PROFILES_META}'`);
  }

  /** Use (activate) a subscription — copies to config.yaml and restarts */
  static useSubscription(id: number): void {
    const profilePath = yq(`.profiles[] | select(.id == ${id}) | .path`, PROFILES_META);
    if (!profilePath) throw new Error(`Subscription id ${id} not found`);

    shell(`cat '${profilePath}' > '${CONFIG_BASE}'`);
    ClashService.mergeConfigRestart();
    shell(`${BIN_YQ} -i '.use = ${id}' '${PROFILES_META}'`);
  }

  /** Update a subscription from its URL */
  static updateSubscription(id?: number): void {
    if (id === undefined) {
      id = parseInt(yq('.use // 1', PROFILES_META), 10);
    }
    const url = yq(`.profiles[] | select(.id == ${id}) | .url`, PROFILES_META);
    const profilePath = yq(`.profiles[] | select(.id == ${id}) | .path`, PROFILES_META);
    if (!url) throw new Error(`Subscription id ${id} not found`);

    const ua = 'clash-verge/v2.4.0';
    const tempFile = `${RESOURCES_DIR}/temp.yaml`;
    shell(`curl -sf --insecure -L --max-time 30 --user-agent '${ua}' -o '${tempFile}' '${url}'`, 35_000);

    const valid = shell(`${BIN_MIHOMO} -d ${RESOURCES_DIR} -f ${tempFile} -t 2>&1 && echo OK || echo FAIL`);
    if (!valid.includes('OK')) throw new Error('Updated subscription config is invalid');

    shell(`cat '${tempFile}' > '${profilePath}'`);
    const current = parseInt(yq('.use // 0', PROFILES_META), 10);
    if (current === id) {
      ClashService.useSubscription(id);
    }
  }

  /**
   * Ensure private-network DIRECT rules exist at the top of runtime.yaml.
   * This is a safety net: even if mixin.yaml is missing them, SSH to
   * remote servers in private subnets will never be proxied.
   */
  static ensureLanRules(): void {
    const lanRules = [
      'IP-CIDR,127.0.0.0/8,DIRECT', 'IP-CIDR,10.0.0.0/8,DIRECT',
      'IP-CIDR,172.16.0.0/12,DIRECT', 'IP-CIDR,192.168.0.0/16,DIRECT',
      'IP-CIDR,100.64.0.0/10,DIRECT', 'IP-CIDR,169.254.0.0/16,DIRECT',
      'IP-CIDR6,::1/128,DIRECT', 'IP-CIDR6,fc00::/7,DIRECT', 'IP-CIDR6,fe80::/10,DIRECT',
    ];
    try {
      const first = yq('.rules[0] // ""', CONFIG_RUNTIME);
      if (first === lanRules[0]) return;
    } catch { /* */ }

    const entries = lanRules.map(r => `"${r}"`).join(', ');
    shell(`${BIN_YQ} -i '.rules = [${entries}] + (.rules // [])' '${CONFIG_RUNTIME}'`);
  }

  /** Merge config.yaml + mixin.yaml → runtime.yaml and restart mihomo */
  static mergeConfigRestart(): void {
    shell(`cd ${CLASH_BASE_DIR} && bin/yq eval-all '
      select(fileIndex==0) as $config |
      select(fileIndex==1) as $mixin |
      $mixin |= del(._custom) |
      (($config // {}) * $mixin) as $runtime |
      $runtime |
      .rules = (($mixin.rules.prefix // []) + ($config.rules // []) + ($mixin.rules.suffix // [])) |
      .proxies = (($mixin.proxies.prefix // []) + (($config.proxies // []) as $cl | ($mixin.proxies.override // []) as $ol | $cl | map(. as $ci | ($ol[] | select(.name == $ci.name)) // $ci)) + ($mixin.proxies.suffix // [])) |
      .proxy-groups = (($mixin.proxy-groups.prefix // []) + (($config.proxy-groups // []) as $cl | ($mixin.proxy-groups.override // []) as $ol | $cl | map(. as $ci | ($ol[] | select(.name == $ci.name)) // $ci)) + ($mixin.proxy-groups.suffix // []))
    ' resources/config.yaml resources/mixin.yaml > resources/runtime.yaml`);

    ClashService.ensureLanRules();

    shell('sudo pkill -9 -f "mihomo" || true');
    shell('sleep 0.3');
    shell(`sudo bash -c 'nohup ${BIN_MIHOMO} -d ${RESOURCES_DIR} -f ${CONFIG_RUNTIME} >> ${RESOURCES_DIR}/mihomo.log 2>&1 &'`);
    shell('sleep 1');
  }

  /** Get proxy groups from mihomo API */
  static async getProxyGroups(): Promise<ClashProxyGroup[]> {
    const data = await mihomoGet('/proxies');
    const proxies = data.proxies || {};
    const groups: ClashProxyGroup[] = [];
    for (const [name, info] of Object.entries(proxies) as [string, any][]) {
      if (['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(info.type)) {
        groups.push({ name, type: info.type, now: info.now || '', all: info.all || [] });
      }
    }
    return groups;
  }

  /** Get all proxy nodes from mihomo API */
  static async getProxyNodes(): Promise<ClashProxyNode[]> {
    const data = await mihomoGet('/proxies');
    const proxies = data.proxies || {};
    const nodes: ClashProxyNode[] = [];
    const skipTypes = new Set(['Direct', 'Reject', 'Compatible', 'Pass', 'RejectDrop', 'Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay']);
    for (const [name, info] of Object.entries(proxies) as [string, any][]) {
      if (!skipTypes.has(info.type)) {
        nodes.push({ name, type: info.type, alive: info.alive ?? false, history: info.history || [] });
      }
    }
    return nodes;
  }

  /** Switch the active node in a proxy group */
  static async switchNode(group: string, node: string): Promise<void> {
    await mihomoPut(`/proxies/${encodeURIComponent(group)}`, { name: node });
  }

  /** Test proxy connectivity — returns exit IP info */
  static async testConnectivity(): Promise<{ success: boolean; ip?: string; country?: string; city?: string; error?: string }> {
    try {
      const { url: apiUrl, secret } = mihomoApiUrl();
      const port = yq('.mixed-port // 7890', CONFIG_RUNTIME);
      const result = shell(`curl -s -x http://127.0.0.1:${port} --connect-timeout 10 --max-time 15 https://ipinfo.io/json`, 20_000);
      const parsed = JSON.parse(result);
      return { success: true, ip: parsed.ip, country: parsed.country, city: parsed.city };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /** Get the local proxy URL for env injection */
  static getProxyUrl(): string | null {
    try {
      const port = yq('.mixed-port // ""', CONFIG_RUNTIME);
      if (!port) return null;
      return `http://127.0.0.1:${port}`;
    } catch {
      return null;
    }
  }
}
