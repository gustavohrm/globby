import { register } from "../../router";
import { getLobbyUsers } from "../../../modules/users";
import type { Env } from "../../../../index";

register<Env>({
  method: "GET",
  path: "/api/v1/lobby/users",
  handler: async (_req, _params, env) => {
    const users = await getLobbyUsers(env.USERS_KV);
    return Response.json({ users });
  },
});
