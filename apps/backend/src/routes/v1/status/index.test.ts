import { describe, it, expect } from "vitest";
import { handle } from "../../router";
import ".";

describe("status route", () => {
  it("responds to GET /api/v1/status with ok", async () => {
    const request = new Request("http://localhost/api/v1/status");
    const response = await handle(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
