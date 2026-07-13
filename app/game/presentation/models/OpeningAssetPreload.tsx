"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";

import { AUTHORED_HERO_COUPE_URL } from "./authored-hero-coupe";
import { AUTHORED_AGENT_MODEL_URLS } from "./authored-agent-model";

export function OpeningAssetPreload({
  onReady,
}: {
  readonly onReady?: () => void;
}) {
  useGLTF(AUTHORED_HERO_COUPE_URL);
  useGLTF(AUTHORED_AGENT_MODEL_URLS.player);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return null;
}
