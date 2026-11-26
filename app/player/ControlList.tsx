import { parseControl } from "./controls";
import styles from "./ControlList.module.css";

/** A run's recorded controls, with leading key names shown as key caps. */
export function ControlList({
  controls,
  compact = false,
}: {
  controls: readonly string[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? styles.compact : styles.list}>
      {controls.map((text) => {
        const { keys, action } = parseControl(text);
        return (
          <li key={text}>
            {keys.length > 0 ? (
              <span className={styles.keys}>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            ) : null}
            <span>{action}</span>
          </li>
        );
      })}
    </ul>
  );
}
