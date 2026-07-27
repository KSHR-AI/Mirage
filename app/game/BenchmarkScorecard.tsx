import { BENCHMARK_TASK, FEATURED_RUN } from "../benchmark/catalog";
import styles from "./HotDrop.module.css";

const SEGMENT_COUNT = 10;

export function BenchmarkScorecard() {
  const progress = FEATURED_RUN.progress.percent;
  const activeSegments = Math.ceil((progress / 100) * SEGMENT_COUNT);

  return (
    <section
      className={styles.benchmarkScorecard}
      aria-label={`${BENCHMARK_TASK.brandName} ${BENCHMARK_TASK.surfaceLabel}: ${progress}% submitter-reported progress with ${FEATURED_RUN.model}`}
    >
      <header className={styles.benchmarkHeader}>
        <span>Submitter progress estimate</span>
        <strong>
          <b>{progress}%</b> complete
        </strong>
      </header>

      <div
        className={styles.benchmarkTrack}
        role="progressbar"
        aria-label="Submitter-reported progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
          <i
            key={index}
            className={
              index < activeSegments ? styles.benchmarkSegmentActive : ""
            }
            aria-hidden="true"
          />
        ))}
      </div>

      <footer className={styles.benchmarkModel}>
        <span>Active frontier model</span>
        <code>{FEATURED_RUN.model}</code>
        <b>Live</b>
      </footer>
    </section>
  );
}
