import {
  EMPTY_INPUT_FRAME,
  type InputFrame,
  type InputSource,
  type Vec2,
} from "../core/contracts";

export type DigitalAction =
  | "move-forward"
  | "move-back"
  | "move-left"
  | "move-right"
  | "brake"
  | "sprint"
  | "aim"
  | "jump"
  | "interact"
  | "fire"
  | "reload"
  | "pause";

export type AnalogAction =
  | "move-x"
  | "move-y"
  | "look-x"
  | "look-y"
  | "throttle"
  | "steer";

export type GameAction = DigitalAction | AnalogAction;

export type RemappableKeyboardAction = Extract<
  DigitalAction,
  | "move-forward"
  | "move-back"
  | "move-left"
  | "move-right"
  | "sprint"
  | "interact"
  | "reload"
>;

export type KeyboardLayout = Readonly<Record<RemappableKeyboardAction, string>>;

export const REMAPPABLE_KEYBOARD_ACTIONS = Object.freeze([
  "move-forward",
  "move-back",
  "move-left",
  "move-right",
  "sprint",
  "interact",
  "reload",
] as const satisfies readonly RemappableKeyboardAction[]);

export const DEFAULT_KEYBOARD_LAYOUT: KeyboardLayout = Object.freeze({
  "move-forward": "KeyW",
  "move-back": "KeyS",
  "move-left": "KeyA",
  "move-right": "KeyD",
  sprint: "ShiftLeft",
  interact: "KeyE",
  reload: "KeyR",
});

const BINDABLE_KEYBOARD_CODE =
  /^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|(?:Shift|Control|Alt)(?:Left|Right)|Enter|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/;

export function isBindableKeyboardCode(code: string): boolean {
  return BINDABLE_KEYBOARD_CODE.test(code);
}

export function remapKeyboardLayout(
  layout: KeyboardLayout,
  action: RemappableKeyboardAction,
  code: string,
): KeyboardLayout {
  if (!isBindableKeyboardCode(code) || layout[action] === code) return layout;

  const previousCode = layout[action];
  const conflict = REMAPPABLE_KEYBOARD_ACTIONS.find(
    (candidate) => candidate !== action && layout[candidate] === code,
  );
  const next: Record<RemappableKeyboardAction, string> = { ...layout };
  next[action] = code;
  if (conflict) next[conflict] = previousCode;
  return Object.freeze(next);
}

export function normalizeKeyboardLayout(value: unknown): KeyboardLayout {
  if (!value || typeof value !== "object") return DEFAULT_KEYBOARD_LAYOUT;

  let layout = DEFAULT_KEYBOARD_LAYOUT;
  const source = value as Partial<Record<RemappableKeyboardAction, unknown>>;
  for (const action of REMAPPABLE_KEYBOARD_ACTIONS) {
    const code = source[action];
    if (typeof code === "string" && isBindableKeyboardCode(code)) {
      layout = remapKeyboardLayout(layout, action, code);
    }
  }
  return layout;
}

export function createKeyboardActionMap(
  layout: KeyboardLayout = DEFAULT_KEYBOARD_LAYOUT,
): Readonly<Record<string, DigitalAction>> {
  const keyboard: Record<string, DigitalAction> = {
    ArrowUp: "move-forward",
    ArrowDown: "move-back",
    ArrowLeft: "move-left",
    ArrowRight: "move-right",
    ShiftRight: "sprint",
    Space: "jump",
    Mouse0: "fire",
    Mouse2: "aim",
    Escape: "pause",
  };
  for (const action of REMAPPABLE_KEYBOARD_ACTIONS) {
    keyboard[layout[action]] = action;
  }
  return Object.freeze(keyboard);
}

const KEYBOARD_CODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ShiftLeft: "SHIFT",
  ShiftRight: "SHIFT",
  ControlLeft: "CTRL",
  ControlRight: "CTRL",
  AltLeft: "ALT",
  AltRight: "ALT",
  Enter: "ENTER",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
});

export function formatKeyboardCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return KEYBOARD_CODE_LABELS[code] ?? code.toUpperCase();
}

export interface InputBindings {
  readonly keyboard: Readonly<Record<string, DigitalAction>>;
  readonly gamepadDeadzone: number;
  readonly lookSensitivity: number;
  readonly invertLookY: boolean;
}

export const DEFAULT_INPUT_BINDINGS: InputBindings = {
  keyboard: createKeyboardActionMap(),
  gamepadDeadzone: 0.16,
  lookSensitivity: 1,
  invertLookY: false,
};

const EDGE_ACTIONS = new Set<DigitalAction>([
  "jump",
  "interact",
  "reload",
  "pause",
]);

function clampAxis(value: number) {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeVector(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  if (length <= 1) return [x, y];
  return [x / length, y / length];
}

export class InputBuffer {
  readonly #held = new Set<DigitalAction>();
  readonly #pressed = new Set<DigitalAction>();
  readonly #axes = new Map<AnalogAction, number>();
  #source: InputSource;

  constructor(source: InputSource = "keyboard") {
    this.#source = source;
  }

  setSource(source: InputSource) {
    this.#source = source;
  }

  setAction(action: DigitalAction, active: boolean) {
    const wasActive = this.#held.has(action);
    if (active) {
      this.#held.add(action);
      if (!wasActive) this.#pressed.add(action);
    } else {
      this.#held.delete(action);
    }
  }

  setAxis(action: AnalogAction, value: number) {
    this.#axes.set(action, clampAxis(value));
  }

  addLookDelta(x: number, y: number) {
    this.#axes.set("look-x", (this.#axes.get("look-x") ?? 0) + x);
    this.#axes.set("look-y", (this.#axes.get("look-y") ?? 0) + y);
  }

  reset() {
    this.#held.clear();
    this.#pressed.clear();
    this.#axes.clear();
  }

  frame(): InputFrame {
    const digitalX =
      Number(this.#held.has("move-right")) -
      Number(this.#held.has("move-left"));
    const digitalY =
      Number(this.#held.has("move-forward")) -
      Number(this.#held.has("move-back"));
    const move = normalizeVector(
      this.#axes.get("move-x") ?? digitalX,
      this.#axes.get("move-y") ?? digitalY,
    );
    const look: Vec2 = [
      this.#axes.get("look-x") ?? 0,
      this.#axes.get("look-y") ?? 0,
    ];
    const throttle = this.#axes.get("throttle") ?? digitalY;
    const steer = this.#axes.get("steer") ?? digitalX;
    const edge = (action: DigitalAction) =>
      EDGE_ACTIONS.has(action)
        ? this.#pressed.has(action)
        : this.#held.has(action);

    const frame: InputFrame = {
      ...EMPTY_INPUT_FRAME,
      source: this.#source,
      move,
      look,
      throttle: clampAxis(throttle),
      steer: clampAxis(steer),
      brake: this.#held.has("brake") || this.#held.has("jump"),
      sprint: this.#held.has("sprint"),
      aim: this.#held.has("aim"),
      jumpPressed: edge("jump"),
      interactPressed: edge("interact"),
      firePressed: this.#held.has("fire") || this.#pressed.has("fire"),
      reloadPressed: edge("reload"),
      pausePressed: edge("pause"),
    };

    this.#pressed.clear();
    this.#axes.delete("look-x");
    this.#axes.delete("look-y");
    return frame;
  }
}

export class KeyboardInputAdapter {
  readonly #buffer: InputBuffer;
  #bindings: InputBindings;

  constructor(
    buffer: InputBuffer,
    bindings: InputBindings = DEFAULT_INPUT_BINDINGS,
  ) {
    this.#buffer = buffer;
    this.#bindings = bindings;
  }

  setBindings(bindings: InputBindings) {
    this.#buffer.reset();
    this.#bindings = bindings;
  }

  keyDown(code: string) {
    const action = this.#bindings.keyboard[code];
    if (!action) return false;
    this.#buffer.setSource("keyboard");
    this.#buffer.setAction(action, true);
    return true;
  }

  keyUp(code: string) {
    const action = this.#bindings.keyboard[code];
    if (!action) return false;
    this.#buffer.setAction(action, false);
    return true;
  }

  blur() {
    this.#buffer.reset();
  }
}

export interface GamepadSnapshot {
  readonly axes: readonly number[];
  readonly buttons: readonly {
    readonly pressed: boolean;
    readonly value: number;
  }[];
}

function deadzone(value: number, threshold: number) {
  const absolute = Math.abs(value);
  if (absolute <= threshold) return 0;
  return Math.sign(value) * ((absolute - threshold) / (1 - threshold));
}

export function applyGamepadSnapshot(
  buffer: InputBuffer,
  snapshot: GamepadSnapshot,
  bindings: InputBindings = DEFAULT_INPUT_BINDINGS,
) {
  buffer.setSource("gamepad");
  buffer.setAxis(
    "move-x",
    deadzone(snapshot.axes[0] ?? 0, bindings.gamepadDeadzone),
  );
  buffer.setAxis(
    "move-y",
    -deadzone(snapshot.axes[1] ?? 0, bindings.gamepadDeadzone),
  );
  buffer.setAxis(
    "look-x",
    deadzone(snapshot.axes[2] ?? 0, bindings.gamepadDeadzone) *
      bindings.lookSensitivity,
  );
  buffer.setAxis(
    "look-y",
    deadzone(snapshot.axes[3] ?? 0, bindings.gamepadDeadzone) *
      bindings.lookSensitivity *
      (bindings.invertLookY ? -1 : 1),
  );
  buffer.setAxis(
    "throttle",
    (snapshot.buttons[7]?.value ?? 0) - (snapshot.buttons[6]?.value ?? 0),
  );
  buffer.setAxis(
    "steer",
    deadzone(snapshot.axes[0] ?? 0, bindings.gamepadDeadzone),
  );
  buffer.setAction("jump", snapshot.buttons[0]?.pressed ?? false);
  buffer.setAction("interact", snapshot.buttons[2]?.pressed ?? false);
  buffer.setAction("reload", snapshot.buttons[3]?.pressed ?? false);
  buffer.setAction("fire", snapshot.buttons[5]?.pressed ?? false);
  buffer.setAction("aim", snapshot.buttons[4]?.pressed ?? false);
  buffer.setAction("sprint", snapshot.buttons[10]?.pressed ?? false);
  buffer.setAction("pause", snapshot.buttons[9]?.pressed ?? false);
}
