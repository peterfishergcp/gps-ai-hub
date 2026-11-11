variable "project_id" {
  description = "The Google Cloud Project ID where the smart router will be deployed"
  type        = string
}

variable "region" {
  description = "The GCP Region for Cloud Run and Regional resources"
  type        = string
  default     = "us-central1"
}

variable "domain_name" {
  description = "The custom FQDN for the Load Balancer (e.g. gemini.example.com)"
  type        = string
  default     = "gemini.example.com"
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "ge-smart-router"
}

variable "iap_client_id" {
  description = "OAuth 2.0 Client ID for Identity-Aware Proxy (IAP)"
  type        = string
  default     = ""
}

variable "iap_client_secret" {
  description = "OAuth 2.0 Client Secret for Identity-Aware Proxy (IAP)"
  type        = string
  default     = ""
  sensitive   = true
}
