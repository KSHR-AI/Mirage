import { redirect } from "next/navigation";
import { FEATURED_DEMO } from "../gallery/catalog";

export default function PlayPage() {
  redirect(FEATURED_DEMO.playUrl);
}
