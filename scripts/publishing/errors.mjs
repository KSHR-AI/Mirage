export class PublishingError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = "PublishingError";
    this.details = details;
  }
}

export function invariant(condition, message, details = undefined) {
  if (!condition) throw new PublishingError(message, details);
}
