// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getOrCreateSession } from "./index";

describe("getOrCreateSession", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns stored session without fetching when id and secret are present", async () => {
    localStorage.setItem(
      "globby_session",
      JSON.stringify({ id: "stored-id", secret: "stored-secret" }),
    );
    const fetchSpy = vi.spyOn(global, "fetch");

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: "stored-id", secret: "stored-secret" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to /api/v1/users and persists the result when storage is empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      json: async () => ({ id: "new-id", username: "cool-user", secret: "new-secret" }),
    } as Response);

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: "new-id", secret: "new-secret" });
    expect(JSON.parse(localStorage.getItem("globby_session")!)).toEqual({
      id: "new-id",
      secret: "new-secret",
    });
  });

  it("POSTs to /api/v1/users when stored session is missing id", async () => {
    localStorage.setItem("globby_session", JSON.stringify({ id: "", secret: "orphan" }));
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      json: async () => ({ id: "fresh-id", username: "user", secret: "fresh-secret" }),
    } as Response);

    const session = await getOrCreateSession();

    expect(session).toEqual({ id: "fresh-id", secret: "fresh-secret" });
    expect(JSON.parse(localStorage.getItem("globby_session")!)).toEqual({
      id: "fresh-id",
      secret: "fresh-secret",
    });
  });

  it("throws when fetch rejects (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    await expect(getOrCreateSession()).rejects.toThrow("Network error");
  });
});
