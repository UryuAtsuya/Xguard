import type { AdminDatabaseSnapshot } from "../../shared/types";

export interface AdminSnapshotState {
  data: AdminDatabaseSnapshot | null;
  status: string;
}

export type CustomerFlowPhase = "account" | "backup" | "ready";
