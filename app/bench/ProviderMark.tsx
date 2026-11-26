import { PROVIDERS, type ProviderKey } from "./scores";
import styles from "./ProviderMark.module.css";

export function ProviderMark({
  provider,
  size = 22,
}: {
  provider: ProviderKey;
  size?: number;
}) {
  const { name, color, ink, mark } = PROVIDERS[provider];
  return (
    <span
      className={styles.mark}
      style={{
        width: size,
        height: size,
        background: color,
        color: ink,
        fontSize: Math.round(size * (mark.length > 1 ? 0.42 : 0.55)),
      }}
      role="img"
      aria-label={name}
      title={name}
    >
      {mark}
    </span>
  );
}
