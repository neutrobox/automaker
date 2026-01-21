/**
 * Query Invalidation Hooks
 *
 * These hooks connect WebSocket events to React Query cache invalidation,
 * ensuring the UI stays in sync with server-side changes without manual refetching.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import type { AutoModeEvent, SpecRegenerationEvent } from '@/types/electron';
import type { IssueValidationEvent } from '@automaker/types';
import { debounce, type DebouncedFunction } from '@automaker/utils/debounce';
import { useEventRecencyStore } from './use-event-recency';

/**
 * Debounce configuration for auto_mode_progress invalidations
 * - wait: 150ms delay to batch rapid consecutive progress events
 * - maxWait: 2000ms ensures UI updates at least every 2 seconds during streaming
 */
const PROGRESS_DEBOUNCE_WAIT = 150;
const PROGRESS_DEBOUNCE_MAX_WAIT = 2000;

/**
 * Creates a unique key for per-feature debounce tracking
 */
function getFeatureKey(projectPath: string, featureId: string): string {
  return `${projectPath}:${featureId}`;
}

/**
 * Creates a debounced invalidation function for a specific feature's agent output
 */
function createDebouncedInvalidation(
  queryClient: QueryClient,
  projectPath: string,
  featureId: string
): DebouncedFunction<() => void> {
  return debounce(
    () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.agentOutput(projectPath, featureId),
      });
    },
    PROGRESS_DEBOUNCE_WAIT,
    { maxWait: PROGRESS_DEBOUNCE_MAX_WAIT }
  );
}

/**
 * Invalidate queries based on auto mode events
 *
 * This hook subscribes to auto mode events (feature start, complete, error, etc.)
 * and invalidates relevant queries to keep the UI in sync.
 *
 * @param projectPath - Current project path
 *
 * @example
 * ```tsx
 * function BoardView() {
 *   const projectPath = useAppStore(s => s.currentProject?.path);
 *   useAutoModeQueryInvalidation(projectPath);
 *   // ...
 * }
 * ```
 */
export function useAutoModeQueryInvalidation(projectPath: string | undefined) {
  const queryClient = useQueryClient();
  const recordGlobalEvent = useEventRecencyStore((state) => state.recordGlobalEvent);

  // Store per-feature debounced invalidation functions
  // Using a ref to persist across renders without causing re-subscriptions
  const debouncedInvalidationsRef = useRef<Map<string, DebouncedFunction<() => void>>>(new Map());

  useEffect(() => {
    if (!projectPath) return;

    // Capture projectPath in a const to satisfy TypeScript's type narrowing
    const currentProjectPath = projectPath;
    const debouncedInvalidations = debouncedInvalidationsRef.current;

    /**
     * Get or create a debounced invalidation function for a specific feature
     */
    function getDebouncedInvalidation(featureId: string): DebouncedFunction<() => void> {
      const key = getFeatureKey(currentProjectPath, featureId);
      let debouncedFn = debouncedInvalidations.get(key);

      if (!debouncedFn) {
        debouncedFn = createDebouncedInvalidation(queryClient, currentProjectPath, featureId);
        debouncedInvalidations.set(key, debouncedFn);
      }

      return debouncedFn;
    }

    /**
     * Clean up debounced function for a feature (flush pending and remove)
     */
    function cleanupFeatureDebounce(featureId: string): void {
      const key = getFeatureKey(currentProjectPath, featureId);
      const debouncedFn = debouncedInvalidations.get(key);

      if (debouncedFn) {
        // Flush any pending invalidation before cleanup
        debouncedFn.flush();
        debouncedInvalidations.delete(key);
      }
    }

    const api = getElectronAPI();
    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      // Record that we received a WebSocket event (for event recency tracking)
      // This allows polling to be disabled when WebSocket events are flowing
      recordGlobalEvent();

      // Invalidate features when agent completes, errors, or receives plan approval
      if (
        event.type === 'auto_mode_feature_complete' ||
        event.type === 'auto_mode_error' ||
        event.type === 'plan_approval_required' ||
        event.type === 'plan_approved' ||
        event.type === 'plan_rejected' ||
        event.type === 'pipeline_step_complete'
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(currentProjectPath),
        });
      }

      // Invalidate running agents on any status change
      if (
        event.type === 'auto_mode_feature_start' ||
        event.type === 'auto_mode_feature_complete' ||
        event.type === 'auto_mode_error' ||
        event.type === 'auto_mode_resuming_features'
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.runningAgents.all(),
        });
      }

      // Invalidate specific feature when it starts or has phase changes
      if (
        (event.type === 'auto_mode_feature_start' ||
          event.type === 'auto_mode_phase' ||
          event.type === 'auto_mode_phase_complete' ||
          event.type === 'pipeline_step_started') &&
        'featureId' in event
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.single(currentProjectPath, event.featureId),
        });
      }

      // Invalidate agent output during progress updates (DEBOUNCED)
      // Uses per-feature debouncing to batch rapid progress events during streaming
      if (event.type === 'auto_mode_progress' && 'featureId' in event) {
        const debouncedInvalidation = getDebouncedInvalidation(event.featureId);
        debouncedInvalidation();
      }

      // Clean up debounced functions when feature completes or errors
      // This ensures we flush any pending invalidations and free memory
      if (
        (event.type === 'auto_mode_feature_complete' || event.type === 'auto_mode_error') &&
        'featureId' in event &&
        event.featureId
      ) {
        cleanupFeatureDebounce(event.featureId);
      }

      // Invalidate worktree queries when feature completes (may have created worktree)
      if (event.type === 'auto_mode_feature_complete' && 'featureId' in event) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.worktrees.all(currentProjectPath),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.worktrees.single(currentProjectPath, event.featureId),
        });
      }
    });

    // Cleanup on unmount: flush and clear all debounced functions
    return () => {
      unsubscribe();

      // Flush all pending invalidations before cleanup
      for (const debouncedFn of debouncedInvalidations.values()) {
        debouncedFn.flush();
      }
      debouncedInvalidations.clear();
    };
  }, [projectPath, queryClient, recordGlobalEvent]);
}

/**
 * Invalidate queries based on spec regeneration events
 *
 * @param projectPath - Current project path
 */
export function useSpecRegenerationQueryInvalidation(projectPath: string | undefined) {
  const queryClient = useQueryClient();
  const recordGlobalEvent = useEventRecencyStore((state) => state.recordGlobalEvent);

  useEffect(() => {
    if (!projectPath) return;

    const api = getElectronAPI();
    const unsubscribe = api.specRegeneration.onEvent((event: SpecRegenerationEvent) => {
      // Only handle events for the current project
      if (event.projectPath !== projectPath) return;

      // Record that we received a WebSocket event
      recordGlobalEvent();

      if (event.type === 'spec_regeneration_complete') {
        // Invalidate features as new ones may have been generated
        queryClient.invalidateQueries({
          queryKey: queryKeys.features.all(projectPath),
        });

        // Invalidate spec regeneration status
        queryClient.invalidateQueries({
          queryKey: queryKeys.specRegeneration.status(projectPath),
        });
      }
    });

    return unsubscribe;
  }, [projectPath, queryClient, recordGlobalEvent]);
}

/**
 * Invalidate queries based on GitHub validation events
 *
 * @param projectPath - Current project path
 */
export function useGitHubValidationQueryInvalidation(projectPath: string | undefined) {
  const queryClient = useQueryClient();
  const recordGlobalEvent = useEventRecencyStore((state) => state.recordGlobalEvent);

  useEffect(() => {
    if (!projectPath) return;

    const api = getElectronAPI();

    // Check if GitHub API is available before subscribing
    if (!api.github?.onValidationEvent) {
      return;
    }

    const unsubscribe = api.github.onValidationEvent((event: IssueValidationEvent) => {
      // Record that we received a WebSocket event
      recordGlobalEvent();

      if (event.type === 'validation_complete' || event.type === 'validation_error') {
        // Invalidate all validations for this project
        queryClient.invalidateQueries({
          queryKey: queryKeys.github.validations(projectPath),
        });

        // Also invalidate specific issue validation if we have the issue number
        if ('issueNumber' in event && event.issueNumber) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.github.validation(projectPath, event.issueNumber),
          });
        }
      }
    });

    return unsubscribe;
  }, [projectPath, queryClient, recordGlobalEvent]);
}

/**
 * Invalidate session queries based on agent stream events
 *
 * @param sessionId - Current session ID
 */
export function useSessionQueryInvalidation(sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const recordGlobalEvent = useEventRecencyStore((state) => state.recordGlobalEvent);

  useEffect(() => {
    if (!sessionId) return;

    const api = getElectronAPI();
    const unsubscribe = api.agent.onStream((event) => {
      // Only handle events for the current session
      if ('sessionId' in event && event.sessionId !== sessionId) return;

      // Record that we received a WebSocket event
      recordGlobalEvent();

      // Invalidate session history when a message is complete
      if (event.type === 'complete' || event.type === 'message') {
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessions.history(sessionId),
        });
      }

      // Invalidate sessions list when any session changes
      if (event.type === 'complete') {
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessions.all(),
        });
      }
    });

    return unsubscribe;
  }, [sessionId, queryClient, recordGlobalEvent]);
}

/**
 * Combined hook that sets up all query invalidation subscriptions
 *
 * Use this hook at the app root or in a layout component to ensure
 * all WebSocket events properly invalidate React Query caches.
 *
 * @param projectPath - Current project path
 * @param sessionId - Current session ID (optional)
 *
 * @example
 * ```tsx
 * function AppLayout() {
 *   const projectPath = useAppStore(s => s.currentProject?.path);
 *   const sessionId = useAppStore(s => s.currentSessionId);
 *   useQueryInvalidation(projectPath, sessionId);
 *   // ...
 * }
 * ```
 */
export function useQueryInvalidation(
  projectPath: string | undefined,
  sessionId?: string | undefined
) {
  useAutoModeQueryInvalidation(projectPath);
  useSpecRegenerationQueryInvalidation(projectPath);
  useGitHubValidationQueryInvalidation(projectPath);
  useSessionQueryInvalidation(sessionId);
}
