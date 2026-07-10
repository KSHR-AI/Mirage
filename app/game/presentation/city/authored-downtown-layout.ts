import {
  belongsToAuthoredDowntownBlock,
  isInsideAuthoredDowntownBlock,
} from "../../content/authored-downtown";
import type { CityLayout } from "./types";

export function replaceProceduralDowntownBlocks(
  layout: CityLayout,
): CityLayout {
  return {
    ...layout,
    alleys: layout.alleys.filter((alley) => alley.id !== "alley-14--14"),
    buildings: layout.buildings.filter(
      (building) => !belongsToAuthoredDowntownBlock(building.id),
    ),
    neonSigns: layout.neonSigns.filter(
      (sign) =>
        !isInsideAuthoredDowntownBlock(sign.position[0], sign.position[2]),
    ),
    roofDetails: layout.roofDetails.filter(
      (detail) => !belongsToAuthoredDowntownBlock(detail.id),
    ),
    windows: layout.windows.filter(
      (window) => !belongsToAuthoredDowntownBlock(window.id),
    ),
  };
}
