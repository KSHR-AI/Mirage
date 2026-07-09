import { NextResponse } from "next/server";

const ALLOWED_EVENTS = new Set([
  "game_started",
  "fragment_collected",
  "mutation_selected",
  "world_completed",
  "world_shared",
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    event?: unknown;
    seed?: unknown;
    value?: unknown;
  } | null;

  if (!body || typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }

  console.info("mirage_game_event", {
    event: body.event,
    seed: typeof body.seed === "number" ? body.seed : undefined,
    value: typeof body.value === "string" ? body.value.slice(0, 40) : undefined,
  });

  return new NextResponse(null, { status: 204 });
}
