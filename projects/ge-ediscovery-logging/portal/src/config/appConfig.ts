/// <reference types="vite/client" />

/**
 * Runtime Application Configuration
 *
 * Single source of truth for GCP project IDs, BigQuery dataset names,
 * Cloud Storage bucket targets, and authorized domain access lists.
 * Reads strictly from environment variables and runtime API configuration.
 */

export interface AppConfig {
  projectId: string;
  bigqueryDataset: string;
  gcsBucket: string;
  allowedDomains: string[];
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
}

export const APP_CONFIG: AppConfig = {
  projectId: import.meta.env?.VITE_PROJECT_ID || '',
  bigqueryDataset: import.meta.env?.VITE_BIGQUERY_DATASET || '',
  gcsBucket: import.meta.env?.VITE_GCS_BUCKET || '',
  allowedDomains: (import.meta.env?.VITE_ALLOWED_DOMAINS || '')
    .split(',')
    .map((domain: string) => domain.trim().toLowerCase())
    .filter(Boolean),
  firebaseApiKey: import.meta.env?.VITE_FIREBASE_API_KEY || '',
  firebaseAuthDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || (import.meta.env?.VITE_PROJECT_ID ? `${import.meta.env.VITE_PROJECT_ID}.firebaseapp.com` : ''),
};

