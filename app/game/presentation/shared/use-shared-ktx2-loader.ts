"use client";

import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import type { WebGLRenderer } from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { DeferredSharedResourcePool } from "./shared-resource-pool";

const ktx2Loaders = new DeferredSharedResourcePool<WebGLRenderer, KTX2Loader>(
  (renderer) =>
    new KTX2Loader()
      .setTranscoderPath("/vendor/basis/")
      .detectSupport(renderer),
  (loader) => loader.dispose(),
);

export function useSharedKtx2Loader(): KTX2Loader {
  const renderer = useThree((state) => state.gl);
  const loader = useMemo(() => ktx2Loaders.resolve(renderer), [renderer]);
  useLayoutEffect(() => ktx2Loaders.retain(renderer), [renderer]);
  return loader;
}
