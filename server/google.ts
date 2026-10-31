import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleVerifier = (credential: string) => Promise<string | null>;

/**
 * Checks a Google sign-in credential and returns the account's stable ID, or null if it isn't
 * valid. The signature, issuer, expiry and audience are all checked. The audience check is what
 * stops a credential issued to some other website from signing in here.
 */
export function googleVerifier(clientId: string, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_KEYS))): GoogleVerifier {
  return async (credential) => {
    try {
      const { payload } = await jwtVerify(credential, keys, { issuer: GOOGLE_ISSUERS, audience: clientId });
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  };
}
