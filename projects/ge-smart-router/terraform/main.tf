terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable Required Google Cloud APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "compute.googleapis.com",
    "iap.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com"
  ])
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# 2. Cloud Run Service (The Smart Router Dispatcher)
resource "google_cloud_run_v2_service" "router" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    containers {
      image = "gcr.io/${var.project_id}/${var.service_name}:latest"
      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
      env {
        name  = "DEV_MODE"
        value = "false"
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }
    }
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }
  }

  depends_on = [google_project_service.apis]
}

# 3. Serverless Network Endpoint Group (NEG) targeting Cloud Run
resource "google_compute_region_network_endpoint_group" "serverless_neg" {
  name                  = "${var.service_name}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  project               = var.project_id

  cloud_run {
    service = google_cloud_run_v2_service.router.name
  }
}

# 4. External Static IP Address for the Load Balancer
resource "google_compute_global_address" "lb_ip" {
  name    = "${var.service_name}-lb-ip"
  project = var.project_id
}

# 5. Backend Service with Serverless NEG
resource "google_compute_backend_service" "backend" {
  name                  = "${var.service_name}-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.serverless_neg.id
  }

  # Enable Identity-Aware Proxy (IAP) if OAuth credentials are provided
  dynamic "iap" {
    for_each = var.iap_client_id != "" ? [1] : []
    content {
      oauth2_client_id     = var.iap_client_id
      oauth2_client_secret = var.iap_client_secret
    }
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# 6. Google-Managed SSL Certificate
resource "google_compute_managed_ssl_certificate" "cert" {
  name    = "${var.service_name}-cert"
  project = var.project_id

  managed {
    domains = [var.domain_name]
  }
}

# 7. URL Map for Application Load Balancer
resource "google_compute_url_map" "url_map" {
  name            = "${var.service_name}-url-map"
  project         = var.project_id
  default_service = google_compute_backend_service.backend.id
}

# 8. Target HTTPS Proxy
resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "${var.service_name}-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
}

# 9. Global Forwarding Rule (Port 443)
resource "google_compute_global_forwarding_rule" "https_forwarding" {
  name                  = "${var.service_name}-fwd-rule"
  project               = var.project_id
  target                = google_compute_target_https_proxy.https_proxy.id
  port_range            = "443"
  ip_address            = google_compute_global_address.lb_ip.address
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# 10. IAM: Allow IAP Service Agent to invoke Cloud Run
data "google_project" "current" {
  project_id = var.project_id
}

resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.router.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-iap.iam.gserviceaccount.com"
}

# Outputs
output "load_balancer_ip" {
  description = "The reserved external IP for the Application Load Balancer"
  value       = google_compute_global_address.lb_ip.address
}

output "cloud_run_url" {
  description = "The internal Cloud Run URL"
  value       = google_cloud_run_v2_service.router.uri
}
