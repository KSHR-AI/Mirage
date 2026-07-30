import { invariant } from "./errors.mjs";

export function assertCollectionInvariants(
  values,
  { label = "accepted submission collection" } = {},
) {
  const records = values.map((value) => value.submission ?? value);
  const byId = new Map();
  const sourceOwners = new Map();
  const deploymentOwners = new Map();

  for (const record of records) {
    invariant(
      !byId.has(record.id),
      `${label} contains duplicate game ID: ${record.id}`,
    );
    byId.set(record.id, record);

    const sourceIdentity =
      `${record.source.repositoryUrl}@${record.source.commit}`.toLowerCase();
    const existingId = sourceOwners.get(sourceIdentity);
    invariant(
      existingId === undefined,
      `${label} reuses source revision ${record.source.repositoryUrl}@${record.source.commit} for IDs ${existingId} and ${record.id}`,
    );
    sourceOwners.set(sourceIdentity, record.id);

    const deploymentIdentity = record.deployment.url.toLowerCase();
    const existingDeploymentId = deploymentOwners.get(deploymentIdentity);
    invariant(
      existingDeploymentId === undefined,
      `${label} reuses deployment ${record.deployment.url} for IDs ${existingDeploymentId} and ${record.id}`,
    );
    deploymentOwners.set(deploymentIdentity, record.id);
  }

  for (const record of records) {
    if (record.lineage.kind !== "derived") continue;
    const parent = byId.get(record.lineage.parentId);
    invariant(
      parent,
      `${label} derived game "${record.id}" references missing parent "${record.lineage.parentId}"`,
    );
    invariant(
      record.lineage.parentSource.repositoryUrl ===
        parent.source.repositoryUrl &&
        record.lineage.parentSource.commit === parent.source.commit,
      `${label} derived game "${record.id}" parentSource does not match active parent "${record.lineage.parentId}"`,
    );
  }

  const stateById = new Map();
  for (const record of records) {
    if (stateById.get(record.id) === "complete") continue;

    const trail = [];
    let current = record;
    while (current) {
      const state = stateById.get(current.id);
      if (state === "complete") break;
      if (state === "visiting") {
        const cycleStart = trail.indexOf(current.id);
        const cycle = [...trail.slice(cycleStart), current.id].join(" -> ");
        invariant(false, `${label} contains a lineage cycle: ${cycle}`);
      }

      stateById.set(current.id, "visiting");
      trail.push(current.id);
      current =
        current.lineage.kind === "derived"
          ? byId.get(current.lineage.parentId)
          : null;
    }

    for (const id of trail) stateById.set(id, "complete");
  }
}
