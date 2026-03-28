import { handle } from "./src/routes";

export default {
  async fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
