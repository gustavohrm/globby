// apps/backend/index.ts

import { handle } from './src/routes';

export { RoomDO, RoomsRegistry } from './src/modules/rooms';

export interface Env {
  USERS_KV: KVNamespace;
  ROOMS: DurableObjectNamespace;
  ROOMS_REGISTRY: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
