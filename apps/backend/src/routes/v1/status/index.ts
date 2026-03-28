import { register } from "../../router";

register({
  method: "GET",
  path: "/api/v1/status",
  handler: () => Response.json({ status: "ok" }),
});
