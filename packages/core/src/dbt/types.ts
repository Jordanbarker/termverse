export interface DbtProjectConfig {
  name: string;
  version: string;
  profile: string;
  modelPaths: string[];
}

export interface DbtModel {
  name: string;
  path: string;
  materialization: "view" | "table" | "ephemeral";
  schema: string;
}

export interface ModelRunResult {
  status: "success" | "error";
  materialization: "view" | "table" | "ephemeral";
  executionTime: number;
  rowsAffected?: number;
  message?: string;
}

export interface DbtTestResult {
  name: string;
  status: "pass" | "warn" | "fail";
  time: number;
  message?: string;
}

export interface DbtResource {
  name: string;
  type: "model" | "test" | "source" | "seed";
  path?: string;
}

export interface DbtDebugInfo {
  account: string;
  user: string;
  database: string;
  warehouse: string;
  role: string;
  schema: string;
  dbtVersion: string;
  profileName: string;
  target: string;
}

export interface DbtRunSummary {
  pass: number;
  warn: number;
  error: number;
  skip: number;
  total: number;
}
