import dotenv from 'dotenv';
import path from 'path';

// Load root .env first, then local .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const cleanStr = (val?: string) => (val || '').replace(/[\r\n\t"']/g, '').trim();
const cleanRegion = (val?: string) => {
  const cleaned = (val || '').replace(/[^a-zA-Z0-9-]/g, '').trim();
  return cleaned || 'auto';
};

export const config = {
  port: parseInt(process.env.PORT || process.env.SERVER_PORT || '3001', 10),
  host: process.env.SERVER_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'file:./nightshift.db',
  livekit: {
    url: process.env.LIVEKIT_URL || 'wss://voiceline-qy3slc6n.livekit.cloud',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },
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
      `[CONFIG WARNING] Missing required environment variables: ${missing.join(', ')}. LiveKit real-time communication will not function until configured.`
    );
  }
}
