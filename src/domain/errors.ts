export type DomainErrorCode =
  | "AI_CONTENT_MUST_BE_PROPOSED"
  | "CAPABILITY_EVIDENCE_INCOMPLETE"
  | "CAPABILITY_SCOPE_OVERSTATED"
  | "CASE_SECTION_INCOMPLETE"
  | "CITATION_CHAIN_BROKEN"
  | "FACT_REQUIRES_CITATION"
  | "HYPOTHESIS_KIND_MISMATCH"
  | "INVALID_BACKUP"
  | "INVALID_IMPORT"
  | "INVALID_RESULT_STAGE"
  | "OUTPUT_NOT_REVIEWED"
  | "VALIDATION_REQUIRES_HYPOTHESIS";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
