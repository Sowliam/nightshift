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

function loadLiveKitAccounts(): LiveKitAccountConfig[] {
  const accounts: LiveKitAccountConfig[] = [];

  // Slot 1: Primary (defaults to LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET or _1 variant)
  const slot1Url = cleanStr(
    process.env.LIVEKIT_URL_1 || process.env.LIVEKIT_URL || 'wss://voiceline-qy3slc6n.livekit.cloud'
  );
  const slot1Key = cleanStr(
    process.env.LIVEKIT_API_KEY_1 || process.env.LIVEKIT_API_KEY || 'APIr7js7v7NxHjD'
  );
  const slot1Secret = cleanStr(
    process.env.LIVEKIT_API_SECRET_1 || process.env.LIVEKIT_API_SECRET || 'VQkZ672DPv1iqtqY3AmIDef9rtYYeslWjfJjbVjoFfwA'
  );
  const slot1Name = cleanStr(process.env.LIVEKIT_NAME_1) || 'LiveKit Account 1 (Primary)';

  if (slot1Url && slot1Key && slot1Secret) {
    accounts.push({
      slot: 1,
      name: slot1Name,
      url: slot1Url,
      apiKey: slot1Key,
      apiSecret: slot1Secret,
    });
  }

  // Slot 2: Failover Account 1
  const slot2Url = cleanStr(
    process.env.LIVEKIT_URL_2 || 'wss://nightshift-2-97ar462d.livekit.cloud'
  );
  const slot2Key = cleanStr(
    process.env.LIVEKIT_API_KEY_2 || 'APIPyT7StXa7h99'
  );
  const slot2Secret = cleanStr(
    process.env.LIVEKIT_API_SECRET_2 || '9sgG2Kge12Ffk4WteFy3z8fi1ELEv9MXZy1gqTdUWk5D'
  );
  const slot2Name = cleanStr(process.env.LIVEKIT_NAME_2) || 'LiveKit Account 2';

  if (slot2Url && slot2Key && slot2Secret) {
    accounts.push({
      slot: 2,
      name: slot2Name,
      url: slot2Url,
      apiKey: slot2Key,
      apiSecret: slot2Secret,
    });
  }

  // Slot 3: Failover Account 2
  const slot3Url = cleanStr(
    process.env.LIVEKIT_URL_3 || 'wss://nightshift-3-zwh3gynw.livekit.cloud'
  );
  const slot3Key = cleanStr(
    process.env.LIVEKIT_API_KEY_3 || 'APIERXbAFq3LZZA'
  );
  const slot3Secret = cleanStr(
    process.env.LIVEKIT_API_SECRET_3 || 'JE0tBzHzvNeQxjkJe5iu40a2AfKcvuMZefjjhUzEfHDC'
  );
  const slot3Name = cleanStr(process.env.LIVEKIT_NAME_3) || 'LiveKit Account 3';

  if (slot3Url && slot3Key && slot3Secret) {
    accounts.push({
      slot: 3,
      name: slot3Name,
      url: slot3Url,
      apiKey: slot3Key,
      apiSecret: slot3Secret,
    });
  }

  // Check slots 4 through 10 for dynamic expansions
  for (let i = 4; i <= 10; i++) {
    const url = cleanStr(process.env[`LIVEKIT_URL_${i}`]);
    const apiKey = cleanStr(process.env[`LIVEKIT_API_KEY_${i}`]);
    const apiSecret = cleanStr(process.env[`LIVEKIT_API_SECRET_${i}`]);
    const name = cleanStr(process.env[`LIVEKIT_NAME_${i}`]) || `LiveKit Account ${i}`;

    if (url && apiKey && apiSecret) {
      accounts.push({
        slot: i,
        name,
        url,
        apiKey,
        apiSecret,
      });
    }
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
