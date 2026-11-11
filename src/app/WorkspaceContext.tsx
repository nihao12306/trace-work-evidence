import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CreateCaseStudyInput,
  CreateCapabilityClaimInput,
  CreateProjectInput,
  CreateWeeklyBlockInput,
  CreateEvidenceInput,
  CreateRecordInput,
} from "../application/workbench";
import type { WorkbenchSnapshot } from "../application/ports/workbenchRepository";
import type { TraceBackup } from "../domain/model";
import type { CareerProfile } from "../domain/model";
import type {
  LocalFileImportPreview,
  MaterializedCompanionImport,
} from "../application/localImport";
import type {
  CompanionImportPreview,
  CompanionPreviewItem,
} from "../application/ports/localCompanion";
import {
  clearWorkspaceData,
  confirmCompanionImport,
  confirmLocalFileImport,
  exportWorkspaceBackup,
  initializeDemoWorkspace,
  previewLocalFile,
  removeImportedBatch,
  restoreWorkspaceBackup,
  updateAiSettings,
  updateCareerProfile,
  updateWorkspacePreferences,
  workbenchService,
} from "./services";
import { describeStorageError } from "../application/storageErrors";

interface WorkspaceContextValue {
  snapshot?: WorkbenchSnapshot;
  loading: boolean;
  error?: string;
  captureOpen: boolean;
  openCapture(): void;
  closeCapture(): void;
  refresh(): Promise<void>;
  initializeEmpty(): Promise<void>;
  initializeDemo(): Promise<void>;
  exportBackup(): Promise<TraceBackup>;
  restoreBackup(value: unknown): Promise<void>;
  clearWorkspace(): Promise<void>;
  previewLocalFile(input: {
    previewId: string;
    fileName: string;
    content: string;
    importDate: string;
  }): LocalFileImportPreview;
  confirmLocalFileImport(preview: LocalFileImportPreview): Promise<void>;
  confirmCompanionImport(input: {
    preview: CompanionImportPreview;
    items: CompanionPreviewItem[];
  }): Promise<MaterializedCompanionImport>;
  removeImportedBatch(batchId: string): Promise<{
    removedRecordIds: string[];
    preservedRecordIds: string[];
  }>;
  updateAiSettings(input: {
    mode: "off" | "demo" | "custom_endpoint";
    endpoint?: string;
  }): Promise<void>;
  updateWorkspacePreferences(input: {
    timezone: string;
    weekStartsOn: 0 | 1;
  }): Promise<void>;
  updateCareerProfile(input: Omit<CareerProfile, "updatedAt">): Promise<void>;
  createRecord(input: CreateRecordInput): Promise<string>;
  createProject(input: CreateProjectInput): Promise<string>;
  updateProject(projectId: string, input: CreateProjectInput): Promise<void>;
  archiveProject(projectId: string): Promise<void>;
  archiveRecord(recordId: string): Promise<void>;
  assignRecordToProject(recordId: string, projectId?: string): Promise<void>;
  reviseRecord(
    recordId: string,
    text: string,
    changeNote?: string,
  ): Promise<void>;
  createEvidence(input: CreateEvidenceInput): Promise<void>;
  updateEvidence(
    evidenceId: string,
    input: Omit<CreateEvidenceInput, "recordId">,
  ): Promise<void>;
  createStructuredCandidates(recordId: string): Promise<number>;
  createTextCandidates(recordId: string): Promise<number>;
  createAiEvidenceCandidates(recordId: string): Promise<number>;
  reframeTextCandidates(recordId: string): Promise<number>;
  ensureWeeklyReview(weekStart: string, weekEnd: string): Promise<string>;
  assembleWeeklyCandidates(reviewId: string): Promise<number>;
  draftAiWeeklyCandidates(reviewId: string): Promise<number>;
  finalizeWeeklyReview(reviewId: string): Promise<void>;
  startWeeklyRevision(reviewId: string): Promise<void>;
  createWeeklyBlock(input: CreateWeeklyBlockInput): Promise<void>;
  updateWeeklyBlock(
    blockId: string,
    content: string,
    epistemicKind:
      "observed_fact" | "user_judgment" | "ai_inference" | "hypothesis",
  ): Promise<void>;
  confirmWeeklyBlock(blockId: string): Promise<void>;
  rejectWeeklyBlock(blockId: string): Promise<void>;
  restoreWeeklyBlock(blockId: string): Promise<void>;
  createCaseStudy(input: CreateCaseStudyInput): Promise<string>;
  draftAiCaseStudyCandidates(caseStudyId: string): Promise<number>;
  createCapabilityClaim(input: CreateCapabilityClaimInput): Promise<string>;
  updateCapabilityClaim(
    claimId: string,
    input: Omit<CreateCapabilityClaimInput, "caseStudyId"> & {
      caseStudyId?: string;
    },
  ): Promise<void>;
  confirmCapabilityClaim(claimId: string): Promise<void>;
  rejectCapabilityClaim(claimId: string): Promise<void>;
  updateCaseStudyEvidenceSelection(
    caseStudyId: string,
    includedEvidenceIds: string[],
  ): Promise<void>;
  updateCaseStudyBlock(
    blockId: string,
    content: string,
    epistemicKind:
      "observed_fact" | "user_judgment" | "ai_inference" | "hypothesis",
    citationIds?: string[],
  ): Promise<void>;
  confirmCaseStudyBlock(blockId: string): Promise<void>;
  rejectCaseStudyBlock(blockId: string): Promise<void>;
  restoreCaseStudyBlock(blockId: string): Promise<void>;
  finalizeCaseStudy(caseStudyId: string): Promise<void>;
  startCaseStudyRevision(caseStudyId: string): Promise<void>;
  confirmEvidence(evidenceId: string): Promise<void>;
  rejectEvidence(evidenceId: string): Promise<void>;
  restoreEvidence(evidenceId: string): Promise<void>;
  repairCitation(citationId: string): Promise<void>;
  clearError(): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [captureOpen, setCaptureOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(undefined);
      setSnapshot(await workbenchService.getSnapshot());
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    workbenchService
      .getSnapshot()
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
          setError(undefined);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(toMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const runMutation = useCallback(
    async <T,>(mutation: () => Promise<T>): Promise<T> => {
      try {
        setError(undefined);
        const result = await mutation();
        await refresh();
        return result;
      } catch (caught) {
        const message = toMessage(caught);
        setError(message);
        throw new Error(message, { cause: caught });
      }
    },
    [refresh],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...(snapshot === undefined ? {} : { snapshot }),
      loading,
      ...(error === undefined ? {} : { error }),
      captureOpen,
      openCapture: () => setCaptureOpen(true),
      closeCapture: () => setCaptureOpen(false),
      refresh,
      initializeEmpty: () =>
        runMutation(() => workbenchService.initializeEmptyWorkspace()),
      initializeDemo: () => runMutation(initializeDemoWorkspace),
      exportBackup: exportWorkspaceBackup,
      restoreBackup: (value) =>
        runMutation(() => restoreWorkspaceBackup(value)),
      clearWorkspace: () => runMutation(clearWorkspaceData),
      previewLocalFile,
      confirmLocalFileImport: (preview) =>
        runMutation(async () => {
          await confirmLocalFileImport(preview);
        }),
      confirmCompanionImport: (input) =>
        runMutation(() => confirmCompanionImport(input)),
      removeImportedBatch: (batchId) =>
        runMutation(() => removeImportedBatch(batchId)),
      updateAiSettings: (input) => runMutation(() => updateAiSettings(input)),
      updateWorkspacePreferences: (input) =>
        runMutation(() => updateWorkspacePreferences(input)),
      updateCareerProfile: (input) =>
        runMutation(() => updateCareerProfile(input)),
      createRecord: (input) =>
        runMutation(
          async () => (await workbenchService.createRecord(input)).id,
        ),
      createProject: (input) =>
        runMutation(
          async () => (await workbenchService.createProject(input)).id,
        ),
      updateProject: (projectId, input) =>
        runMutation(async () => {
          await workbenchService.updateProject(projectId, input);
        }),
      archiveProject: (projectId) =>
        runMutation(async () => {
          await workbenchService.archiveProject(projectId);
        }),
      archiveRecord: (recordId) =>
        runMutation(async () => {
          await workbenchService.archiveRecord(recordId);
        }),
      assignRecordToProject: (recordId, projectId) =>
        runMutation(async () => {
          await workbenchService.assignRecordToProject(recordId, projectId);
        }),
      reviseRecord: (recordId, text, changeNote) =>
        runMutation(async () => {
          await workbenchService.reviseRecord(recordId, text, changeNote);
        }),
      createEvidence: (input) =>
        runMutation(async () => {
          await workbenchService.createConfirmedEvidence(input);
        }),
      updateEvidence: (evidenceId, input) =>
        runMutation(() => workbenchService.updateEvidence(evidenceId, input)),
      createStructuredCandidates: (recordId) =>
        runMutation(
          async () =>
            (await workbenchService.createStructuredCandidates(recordId))
              .length,
        ),
      createTextCandidates: (recordId) =>
        runMutation(
          async () =>
            (await workbenchService.createTextCandidates(recordId)).length,
        ),
      createAiEvidenceCandidates: (recordId) =>
        runMutation(
          async () =>
            (await workbenchService.createAiEvidenceCandidates(recordId))
              .length,
        ),
      reframeTextCandidates: (recordId) =>
        runMutation(() => workbenchService.reframeTextCandidates(recordId)),
      ensureWeeklyReview: (weekStart, weekEnd) =>
        runMutation(
          async () =>
            (await workbenchService.ensureWeeklyReview(weekStart, weekEnd)).id,
        ),
      assembleWeeklyCandidates: (reviewId) =>
        runMutation(
          async () =>
            (await workbenchService.assembleWeeklyCandidates(reviewId)).length,
        ),
      draftAiWeeklyCandidates: (reviewId) =>
        runMutation(
          async () =>
            (await workbenchService.draftAiWeeklyCandidates(reviewId)).length,
        ),
      finalizeWeeklyReview: (reviewId) =>
        runMutation(async () => {
          await workbenchService.finalizeWeeklyReview(reviewId);
        }),
      startWeeklyRevision: (reviewId) =>
        runMutation(async () => {
          await workbenchService.startWeeklyRevision(reviewId);
        }),
      createWeeklyBlock: (input) =>
        runMutation(async () => {
          await workbenchService.createWeeklyBlock(input);
        }),
      updateWeeklyBlock: (blockId, content, epistemicKind) =>
        runMutation(async () => {
          await workbenchService.updateWeeklyBlock(
            blockId,
            content,
            epistemicKind,
          );
        }),
      confirmWeeklyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.confirmWeeklyBlock(blockId);
        }),
      rejectWeeklyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.rejectWeeklyBlock(blockId);
        }),
      restoreWeeklyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.restoreWeeklyBlock(blockId);
        }),
      createCaseStudy: (input) =>
        runMutation(
          async () => (await workbenchService.createCaseStudy(input)).id,
        ),
      draftAiCaseStudyCandidates: (caseStudyId) =>
        runMutation(
          async () =>
            (await workbenchService.draftAiCaseStudyCandidates(caseStudyId))
              .length,
        ),
      createCapabilityClaim: (input) =>
        runMutation(
          async () => (await workbenchService.createCapabilityClaim(input)).id,
        ),
      updateCapabilityClaim: (claimId, input) =>
        runMutation(async () => {
          await workbenchService.updateCapabilityClaim(claimId, input);
        }),
      confirmCapabilityClaim: (claimId) =>
        runMutation(async () => {
          await workbenchService.confirmCapabilityClaim(claimId);
        }),
      rejectCapabilityClaim: (claimId) =>
        runMutation(async () => {
          await workbenchService.rejectCapabilityClaim(claimId);
        }),
      updateCaseStudyEvidenceSelection: (caseStudyId, includedEvidenceIds) =>
        runMutation(async () => {
          await workbenchService.updateCaseStudyEvidenceSelection(
            caseStudyId,
            includedEvidenceIds,
          );
        }),
      updateCaseStudyBlock: (blockId, content, epistemicKind, citationIds) =>
        runMutation(async () => {
          await workbenchService.updateCaseStudyBlock(
            blockId,
            content,
            epistemicKind,
            citationIds,
          );
        }),
      confirmCaseStudyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.confirmCaseStudyBlock(blockId);
        }),
      rejectCaseStudyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.rejectCaseStudyBlock(blockId);
        }),
      restoreCaseStudyBlock: (blockId) =>
        runMutation(async () => {
          await workbenchService.restoreCaseStudyBlock(blockId);
        }),
      finalizeCaseStudy: (caseStudyId) =>
        runMutation(async () => {
          await workbenchService.finalizeCaseStudy(caseStudyId);
        }),
      startCaseStudyRevision: (caseStudyId) =>
        runMutation(async () => {
          await workbenchService.startCaseStudyRevision(caseStudyId);
        }),
      confirmEvidence: (evidenceId) =>
        runMutation(() => workbenchService.confirmEvidence(evidenceId)),
      rejectEvidence: (evidenceId) =>
        runMutation(() => workbenchService.rejectEvidence(evidenceId)),
      restoreEvidence: (evidenceId) =>
        runMutation(() => workbenchService.restoreEvidence(evidenceId)),
      repairCitation: (citationId) =>
        runMutation(() => workbenchService.repairCitation(citationId)),
      clearError: () => setError(undefined),
    }),
    [captureOpen, error, loading, refresh, runMutation, snapshot],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// The hook intentionally shares this module with its provider so the context stays private.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider 尚未初始化。 ");
  return context;
}

function toMessage(error: unknown): string {
  const storageMessage = describeStorageError(error);
  if (storageMessage) return storageMessage;
  return error instanceof Error
    ? error.message
    : "发生了未知错误，请稍后再试。";
}
