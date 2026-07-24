import styles from "./HotDrop.module.css";

const SATURATION = 10;
const SEGMENT_COUNT = 10;
const ACTIVE_SEGMENTS = Math.ceil((SATURATION / 100) * SEGMENT_COUNT);

export function BenchmarkScorecard() {
  return (
    <section
      className={styles.benchmarkScorecard}
      aria-label={`Mirage ML benchmark: ${SATURATION}% saturated with gpt-5.6-sol`}
    >
      <header className={styles.benchmarkHeader}>
        <span>Mirage benchmark saturation</span>
        <strong>
          <b>{SATURATION}%</b> saturated
        </strong>
      </header>

      <div
        className={styles.benchmarkTrack}
        role="progressbar"
        aria-label="Benchmark saturation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={SATURATION}
      >
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
          <i
            key={index}
            className={
              index < ACTIVE_SEGMENTS ? styles.benchmarkSegmentActive : ""
            }
            aria-hidden="true"
          />
        ))}
      </div>

      <footer className={styles.benchmarkModel}>
        <span>Active frontier model</span>
        <code>gpt-5.6-sol</code>
        <b>Live</b>
      </footer>
    </section>
  );
}
