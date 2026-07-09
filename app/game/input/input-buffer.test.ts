import { describe, expect, it } from "vitest";

import {
  InputBuffer,
  KeyboardInputAdapter,
  applyGamepadSnapshot,
} from "./input-buffer";

describe("InputBuffer", () => {
  it("normalizes simultaneous digital movement", () => {
    const buffer = new InputBuffer();
    const keyboard = new KeyboardInputAdapter(buffer);
    keyboard.keyDown("KeyW");
    keyboard.keyDown("KeyD");

    const frame = buffer.frame();
    expect(frame.move[0]).toBeCloseTo(Math.SQRT1_2);
    expect(frame.move[1]).toBeCloseTo(Math.SQRT1_2);
    expect(frame.throttle).toBe(1);
    expect(frame.steer).toBe(1);
  });

  it("buffers edge actions for one frame", () => {
    const buffer = new InputBuffer();
    const keyboard = new KeyboardInputAdapter(buffer);
    keyboard.keyDown("KeyE");
    expect(buffer.frame().interactPressed).toBe(true);
    expect(buffer.frame().interactPressed).toBe(false);
    keyboard.keyUp("KeyE");
    keyboard.keyDown("KeyE");
    expect(buffer.frame().interactPressed).toBe(true);
  });

  it("clears held input on blur", () => {
    const buffer = new InputBuffer();
    const keyboard = new KeyboardInputAdapter(buffer);
    keyboard.keyDown("KeyW");
    keyboard.blur();
    expect(buffer.frame().move).toEqual([0, 0]);
  });

  it("applies gamepad deadzones and edge actions", () => {
    const buffer = new InputBuffer();
    applyGamepadSnapshot(buffer, {
      axes: [0.5, -0.5, 0.1, 0],
      buttons: Array.from({ length: 12 }, (_, index) => ({
        pressed: index === 0,
        value: index === 7 ? 0.8 : 0,
      })),
    });
    const frame = buffer.frame();
    expect(frame.source).toBe("gamepad");
    expect(frame.move[0]).toBeGreaterThan(0);
    expect(frame.look[0]).toBe(0);
    expect(frame.throttle).toBeCloseTo(0.8);
    expect(frame.jumpPressed).toBe(true);
  });
});
