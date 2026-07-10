import { expect, test } from "@playwright/test";

test("removed platform gates remain unavailable", async ({ request }) => {
  for (const path of [
    "/api/billing/checkout",
    "/api/auth/sign-in",
    "/api/reactor/token",
    "/labs/lingbot",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
