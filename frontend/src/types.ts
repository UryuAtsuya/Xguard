import type { AdminDatabaseSnapshot, BackupRun, ProofPublicPayload } from "../../shared/types";
import type { HealthResponse, OAuthStartResponse } from "./api";

export interface AdminSnapshotState {
  data: AdminDatabaseSnapshot | null;
  status: string;
}

export interface PortalStateProps {
  backupRun: BackupRun | null;
  health: HealthResponse | null;
  isBusy: boolean;
  notice: string;
  oauth: OAuthStartResponse | null;
  proof: ProofPublicPayload | null;
}
