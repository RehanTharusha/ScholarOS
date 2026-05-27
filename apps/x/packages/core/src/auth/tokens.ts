import container from '../di/container.js';
import { IOAuthRepo } from './repo.js';
import { getProviderConfig } from './providers.js';
import * as oauthClient from './oauth-client.js';
import { OAuthTokens } from './types.js';

let refreshInFlight: Promise<OAuthTokens> | null = null;

async function performRefresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    console.log("Refreshing scholaros access token");
    if (!tokens.refresh_token) {
        throw new Error('ScholarOS token expired and no refresh token available. Please sign in again.');
    }

    const providerConfig = await getProviderConfig('scholaros');
    if (providerConfig.discovery.mode !== 'static') {
        throw new Error('ScholarOS provider requires static endpoint mode');
    }
    if (providerConfig.client.mode !== 'static') {
        throw new Error('ScholarOS provider requires static client mode');
    }

    const config = oauthClient.createStaticConfiguration(
        providerConfig.discovery.authorizationEndpoint,
        providerConfig.discovery.tokenEndpoint,
        providerConfig.client.clientId || 'scholaros-desktop',
    );

    const refreshed = await oauthClient.refreshTokens(
        config,
        tokens.refresh_token,
        tokens.scopes,
    );

    const oauthRepo = container.resolve<IOAuthRepo>('oauthRepo');
    await oauthRepo.upsert('scholaros', { tokens: refreshed });

    return refreshed;
}

export async function getAccessToken(): Promise<string> {
    const oauthRepo = container.resolve<IOAuthRepo>('oauthRepo');
    const { tokens } = await oauthRepo.read('scholaros');
    if (!tokens) {
        throw new Error('Not signed into ScholarOS');
    }

    if (!oauthClient.isTokenExpired(tokens)) {
        return tokens.access_token;
    }

    if (!refreshInFlight) {
        refreshInFlight = performRefresh(tokens).finally(() => {
            refreshInFlight = null;
        });
    }
    const refreshed = await refreshInFlight;
    return refreshed.access_token;
}
