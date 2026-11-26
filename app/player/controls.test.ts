import { describe, expect, it } from "vitest";
import { parseControl } from "./controls";

describe("parseControl", () => {
  it("splits keys from the action", () => {
    expect(parseControl("WASD to move or drive; mouse to look")).toEqual({
      keys: ["W", "A", "S", "D"],
      action: "move or drive; mouse to look",
    });
    expect(parseControl("1–5 or mouse wheel to select a weapon")).toEqual({
      keys: ["1–5", "mouse wheel"],
      action: "select a weapon",
    });
    expect(parseControl("H for horn or siren")).toEqual({
      keys: ["H"],
      action: "horn or siren",
    });
  });

  it("keeps prose without leading keys whole", () => {
    const text = "Drive around the whole bay at night to find secrets";
    expect(parseControl(text)).toEqual({ keys: [], action: text });
    const capture = "Click the game to capture the mouse";
    expect(parseControl(capture)).toEqual({ keys: [], action: capture });
    expect(parseControl("Click anywhere")).toEqual({
      keys: [],
      action: "Click anywhere",
    });
  });
});
