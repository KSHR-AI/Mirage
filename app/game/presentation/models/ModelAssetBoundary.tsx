"use client";

import { Component, Suspense, type ReactNode } from "react";

interface ModelAssetErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}

interface ModelAssetErrorBoundaryState {
  readonly failed: boolean;
}

class ModelAssetErrorBoundary extends Component<
  ModelAssetErrorBoundaryProps,
  ModelAssetErrorBoundaryState
> {
  state: ModelAssetErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ModelAssetErrorBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ModelAssetBoundary({
  children,
  fallback,
}: ModelAssetErrorBoundaryProps) {
  return (
    <ModelAssetErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelAssetErrorBoundary>
  );
}
