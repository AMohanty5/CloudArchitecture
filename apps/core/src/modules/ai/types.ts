/** Streamed AI generation events (blueprint doc 07 pipeline; doc 08 WS/SSE stages). */

export type AiStage = 'router' | 'requirements' | 'planner' | 'composer' | 'critic' | 'repair';

export interface StageEvent {
  type: 'stage';
  stage: AiStage;
  status: 'started' | 'completed';
  promptId?: string;
  model?: string;
  detail?: string;
  inputTokens?: number;
  outputTokens?: number;
}
export interface UsageEvent {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}
export interface DoneEvent {
  type: 'done';
  branch: string;
  message: string;
}
export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type AiEvent = StageEvent | UsageEvent | DoneEvent | ErrorEvent;

export interface GenerateInput {
  prompt: string;
  provider?: 'aws' | 'azure' | 'gcp';
}
