import { Color } from "three";

export function liftFacadeColor(color: string): string {
  return `#${new Color(color)
    .convertLinearToSRGB()
    .lerp(new Color("#d7d8d2").convertLinearToSRGB(), 0.28)
    .convertSRGBToLinear()
    .getHexString()}`;
}
