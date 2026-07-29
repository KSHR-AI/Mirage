// Without allow-same-origin, game code receives an opaque origin: it cannot
// read Mirage state, and its proxy subrequests carry no Mirage credentials.
export const GAME_IFRAME_SANDBOX = "allow-scripts allow-pointer-lock";
