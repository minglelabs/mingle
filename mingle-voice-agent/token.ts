import { AccessToken } from 'livekit-server-sdk';
import { env } from './env';

export const INTERPRETER_ROLE = 'interpreter';

export async function createJoinToken(input: {
    room: string;
    identity: string;
    name: string;
    attributes: Record<string, string>;
    agent?: boolean;
}): Promise<string> {
    const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
        identity: input.identity,
        name: input.name,
        attributes: input.attributes,
        ttl: '6h',
    });
    token.addGrant({
        room: input.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        // Clients flip `interpret` on/off through their own attributes.
        canUpdateOwnMetadata: true,
        agent: input.agent === true,
    });
    return token.toJwt();
}
