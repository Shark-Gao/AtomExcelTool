import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { isIP } from 'net';
import { basename, dirname, join } from 'path';

const DEFAULT_SERVER_HOST = '10.30.129.12';
const CONFIG_FILE_NAME = 'telemetry.json';

/**
 * The packaged MCP server runs in a separate Node process, so its execPath is
 * node.exe rather than the application's EXE. Locate the application root from
 * the shared module's path inside resources/app.asar(.unpacked) instead.
 */
function getPackagedAppRoot(): string | null {
  let current = __dirname;
  while (true) {
    const name = basename(current).toLowerCase();
    if (name === 'app.asar' || name === 'app.asar.unpacked') {
      return dirname(dirname(current));
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Project-root telemetry.json in development; EXE-adjacent telemetry.json when packaged. */
export function getTelemetryConfigPath(): string {
  const packagedRoot = getPackagedAppRoot();
  if (packagedRoot) {
    const exeDirectory = process.versions.electron
      ? dirname(process.execPath)
      : packagedRoot;
    return join(exeDirectory, CONFIG_FILE_NAME);
  }
  return join(__dirname, '../../..', CONFIG_FILE_NAME);
}

function validServerHost(host: string): boolean {
  if (isIP(host) === 4) return true;
  // A malformed IPv4 literal must not be accepted as a DNS name.
  if (/^[\d.]+$/.test(host) || host.length > 253) return false;
  return host.split('.').every(label =>
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)
  );
}

/** Read each time so a changed IP takes effect without rebuilding or restarting. */
export function getTelemetryEndpoint(): string {
  const configPath = getTelemetryConfigPath();
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    try {
      writeFileSync(
        configPath,
        `${JSON.stringify({ server_host: DEFAULT_SERVER_HOST }, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const content = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    const config: unknown = JSON.parse(content);
    const rawHost = config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>).server_host
      : undefined;
    if (typeof rawHost !== 'string' || !validServerHost(rawHost.trim())) {
      throw new Error('server_host must be a valid IPv4 address or DNS hostname');
    }
    return `http://${rawHost.trim()}:9876/api/notify`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid telemetry config at ${configPath}: ${reason}`);
  }
}
