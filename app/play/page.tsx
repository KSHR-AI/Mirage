import { redirect } from "next/navigation";
import { FEATURED_RUN } from "../benchmark/catalog";

export default function PlayPage() {
  redirect(FEATURED_RUN.playUrl);
}
