import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load root .env first, then local .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const cleanStr = (val?: string) => (val || '').replace(/[\r\n\t"']/g, '').trim();
const cleanRegion = (val?: string) => {
  const cleaned = (val || '').replace(/[^a-zA-Z0-9-]/g, '').trim();
  return cleaned || 'auto';
};

export interface LiveKitAccountConfig {
  slot: number;
  name: string;
  url: string;
  apiKey: string;
  apiSecret: string;
}

function parseLiveKitSlot(
  slotNum: number,
  rawUrl?: string,
  rawKey?: string,
  rawSecret?: string,
  defUrl?: string,
  defKey?: string,
  defSecret?: string,
  defName?: string
): LiveKitAccountConfig | null {
  const combined = [rawUrl || '', rawKey || '', rawSecret || ''].join('\n');

  if (!combined.trim() && !defUrl) {
    return null;
  }

  // Extract URL (protects against accidental multi-line pastes in single env var)
  const urlMatch = combined.match(/wss:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*(?:\.livekit\.cloud|\.io|\.com)/);
  const url = cleanStr(urlMatch ? urlMatch[0] : (rawUrl?.startsWith('wss://') ? rawUrl : defUrl));

  // Extract API Key
  const keyMatch = combined.match(/(?:API_KEY(?:_\d+)?\s*[=:]\s*|\b)(API[a-zA-Z0-9]{10,24})(?=[^a-zA-Z0-9]|$|LIVEKIT)/);
  const apiKey = cleanStr(keyMatch ? keyMatch[1] : (rawKey || defKey));

  // Extract Secret
  const secretMatch = combined.match(/(?:API_SECRET(?:_\d+)?\s*[=:]\s*|\b)([a-zA-Z0-9]{36,55})(?=[^a-zA-Z0-9]|$|LIVEKIT)/);
  const apiSecret = cleanStr(secretMatch ? secretMatch[1] : (rawSecret || defSecret));

  const name = cleanStr(process.env[`LIVEKIT_NAME_${slotNum}`]) || defName || `LiveKit Account ${slotNum}`;

  if (url && apiKey && apiSecret) {
    return {
      slot: slotNum,
      name,
      url,
      apiKey,
      apiSecret,
    };
  }

  return null;
}

function loadLiveKitAccounts(): LiveKitAccountConfig[] {
  const accounts: LiveKitAccountConfig[] = [];

  // Slot 1: Primary (defaults to LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET or _1 variant)
  const slot1 = parseLiveKitSlot(
    1,
    process.env.LIVEKIT_URL_1 || process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY_1 || process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET_1 || process.env.LIVEKIT_API_SECRET,
    'wss://voiceline-qy3slc6n.livekit.cloud',
    'APIr7js7v7NxHjD',
    'VQkZ672DPv1iqtqY3AmIDef9rtYYeslWjfJjbVjoFfwA',
    'LiveKit Account 1 (Primary)'
  );
  if (slot1) accounts.push(slot1);

  // Slot 2: Failover Account 1
  const slot2 = parseLiveKitSlot(
    2,
    process.env.LIVEKIT_URL_2,
    process.env.LIVEKIT_API_KEY_2,
    process.env.LIVEKIT_API_SECRET_2,
    'wss://nightshift-2-97ar462d.livekit.cloud',
    'APIPyT7StXa7h99',
    '9sgG2Kge12Ffk4WteFy3z8fi1ELEv9MXZy1gqTdUWk5D',
    'LiveKit Account 2'
  );
  if (slot2) accounts.push(slot2);

  // Slot 3: Failover Account 2
  const slot3 = parseLiveKitSlot(
    3,
    process.env.LIVEKIT_URL_3,
    process.env.LIVEKIT_API_KEY_3,
    process.env.LIVEKIT_API_SECRET_3,
    'wss://nightshift-3-zwh3gynw.livekit.cloud',
    'APIERXbAFq3LZZA',
    'JE0tBzHzvNeQxjkJe5iu40a2AfKcvuMZefjjhUzEfHDC',
    'LiveKit Account 3'
  );
  if (slot3) accounts.push(slot3);

  // Check slots 4 through 10 for dynamic expansions
  for (let i = 4; i <= 10; i++) {
    const slot = parseLiveKitSlot(
      i,
      process.env[`LIVEKIT_URL_${i}`],
      process.env[`LIVEKIT_API_KEY_${i}`],
      process.env[`LIVEKIT_API_SECRET_${i}`]
    );
    if (slot) accounts.push(slot);
  }

  return accounts;
}

const defaultDbUrl = fs.existsSync('/data') ? 'file:/data/nightshift.db' : 'file:./nightshift.db';
const livekitAccounts = loadLiveKitAccounts();

export const config = {
  port: parseInt(process.env.PORT || process.env.SERVER_PORT || '3001', 10),
  host: process.env.SERVER_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || defaultDbUrl,
  livekit: {
    url: livekitAccounts[0]?.url || process.env.LIVEKIT_URL || 'wss://voiceline-qy3slc6n.livekit.cloud',
    apiKey: livekitAccounts[0]?.apiKey || process.env.LIVEKIT_API_KEY || '',
    apiSecret: livekitAccounts[0]?.apiSecret || process.env.LIVEKIT_API_SECRET || '',
  },
  livekitAccounts,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  r2: {
    accountId: cleanStr(process.env.R2_ACCOUNT_ID),
    accessKeyId: cleanStr(process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID),
    secretAccessKey: cleanStr(process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY),
    bucketName: cleanStr(process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'nightshift-audio'),
    publicUrl: cleanStr(process.env.R2_PUBLIC_URL),
    endpoint: cleanStr(process.env.S3_ENDPOINT),
    region: cleanRegion(process.env.R2_REGION || process.env.S3_REGION || process.env.AWS_REGION || 'auto'),
  },
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.livekit.url) missing.push('LIVEKIT_URL');
  if (!config.livekit.apiKey) missing.push('LIVEKIT_API_KEY');
  if (!config.livekit.apiSecret) missing.push('LIVEKIT_API_SECRET');

  if (missing.length > 0) {
    console.warn(
      `[CONFIG WARNING] Missing required primary LiveKit credentials: ${missing.join(', ')}. LiveKit real-time communication will not function until configured.`
    );
  } else {
    console.log(
      `[CONFIG] LiveKit Pool loaded: ${config.livekitAccounts.length} account(s) ready (Primary: ${config.livekit.url})`
    );
  }
}
