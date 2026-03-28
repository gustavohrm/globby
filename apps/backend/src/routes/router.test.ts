import { describe, it, expect } from "vitest";
import { register, handle } from "./router";

describe("Router", () => {
  it("matches a registered route", async () => {
    register({
      method: "GET",
      path: "/test",
      handler: () => new Response("hit"),
    });

    const response = await handle(new Request("http://localhost/test"));
    expect(await response.text()).toBe("hit");
  });

  it("returns 404 for unregistered paths", async () => {
    const response = await handle(new Request("http://localhost/missing"));
    expect(response.status).toBe(404);
  });

  it("distinguishes between methods", async () => {
    register({
      method: "GET",
      path: "/resource",
      handler: () => new Response("get"),
    });
    register({
      method: "POST",
      path: "/resource",
      handler: () => new Response("post"),
    });

    const get = await handle(new Request("http://localhost/resource"));
    expect(await get.text()).toBe("get");

    const post = await handle(
      new Request("http://localhost/resource", { method: "POST" }),
    );
    expect(await post.text()).toBe("post");
  });
});
