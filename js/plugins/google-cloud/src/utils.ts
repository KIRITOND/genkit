/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TraceFlags } from '@opentelemetry/api';
import { ReadableSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import { resolveCurrentPrincipal } from './auth';

export function extractOuterFlowNameFromPath(path: string) {
  if (!path || path === '<unknown>') {
    return '<unknown>';
  }

  const flowName = path.match('/{(.+),t:flow}+');
  return flowName ? flowName[1] : '<unknown>';
}

/**
 * Extract first feature name from a path
 * e.g. for /{myFlow,t:flow}/{myStep,t:flowStep}/{googleai/gemini-pro,t:action,s:model}
 * returns "myFlow"
 */
export function extractOuterFeatureNameFromPath(path: string) {
  if (!path || path === '<unknown>') {
    return '<unknown>';
  }
  const first = path.split('/')[1];
  const featureName = first?.match('{(.+),t:(flow|action|prompt|helper)');
  return featureName ? featureName[1] : '<unknown>';
}

export function extractErrorName(events: TimedEvent[]): string | undefined {
  return events
    .filter((event) => event.name === 'exception')
    .map((event) => {
      const attributes = event.attributes;
      return attributes
        ? (attributes['exception.type'] as string)
        : '<unknown>';
    })
    .at(0);
}

export function extractErrorMessage(events: TimedEvent[]): string | undefined {
  return events
    .filter((event) => event.name === 'exception')
    .map((event) => {
      const attributes = event.attributes;
      return attributes
        ? (attributes['exception.message'] as string)
        : '<unknown>';
    })
    .at(0);
}

export function extractErrorStack(events: TimedEvent[]): string | undefined {
  return events
    .filter((event) => event.name === 'exception')
    .map((event) => {
      const attributes = event.attributes;
      return attributes
        ? (attributes['exception.stacktrace'] as string)
        : '<unknown>';
    })
    .at(0);
}

export function createCommonLogAttributes(
  span: ReadableSpan,
  projectId?: string
) {
  const spanContext = span.spanContext();
  const isSampled = !!(spanContext.traceFlags & TraceFlags.SAMPLED);
  return {
    'logging.googleapis.com/spanId': spanContext.spanId,
    'logging.googleapis.com/trace': `projects/${projectId}/traces/${spanContext.traceId}`,
    'logging.googleapis.com/trace_sampled': isSampled ? '1' : '0',
  };
}

export function requestDenied(
  err: Error & {
    code?: number;
    statusDetails?: Record<string, any>[];
  }
) {
  return err.code === 7;
}

export function loggingDenied(
  err: Error & {
    code?: number;
    statusDetails?: Record<string, any>[];
  }
) {
  return (
    requestDenied(err) &&
    err.statusDetails?.some((details) => {
      return details?.metadata?.permission === 'logging.logEntries.create';
    })
  );
}

export function tracingDenied(
  err: Error & {
    code?: number;
    statusDetails?: Record<string, any>[];
  }
) {
  // Looks like we don't get status details like we do with logging
  return requestDenied(err);
}

export function metricsDenied(
  err: Error & {
    code?: number;
    statusDetails?: Record<string, any>[];
  }
) {
  // Looks like we don't get status details like we do with logging
  return requestDenied(err);
}

export async function permissionDeniedHelpText(role: string) {
  const principal = await resolveCurrentPrincipal();
  return `Add the role '${role}' to your Service Account in the IAM & Admin page on the Google Cloud console, or use the following command:\n\ngcloud projects add-iam-policy-binding ${principal.projectId ?? '${PROJECT_ID}'} \\\n    --member=serviceAccount:${principal.serviceAccountEmail || '${SERVICE_ACCT}'} \\\n    --role=${role}`;
}

export async function loggingDeniedHelpText() {
  return permissionDeniedHelpText('roles/logging.logWriter');
}

export async function tracingDeniedHelpText() {
  return permissionDeniedHelpText('roles/cloudtrace.agent');
}

export async function metricsDeniedHelpText() {
  return permissionDeniedHelpText('roles/monitoring.metricWriter');
}
