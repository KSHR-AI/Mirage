import { PROVIDERS, type ProviderKey } from "./entries";
import styles from "./ProviderMark.module.css";

export function ProviderMark({
  provider,
  size = 22,
}: {
  provider: ProviderKey;
  size?: number;
}) {
  const { name, color, ink, mark, logo } = PROVIDERS[provider];
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG
      <img
        className={styles.logo}
        src={logo}
        width={size}
        height={size}
        alt={name}
        title={name}
      />
    );
  }
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
