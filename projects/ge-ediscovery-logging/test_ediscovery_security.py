#!/usr/bin/env python3
"""
Deterministic offline security, anti-spoliation, and greenfield SQL/CLI regression
suite for `projects/ge-ediscovery-logging` (verifies ED-1 through ED-8).

All local test HTTP servers bind strictly to `127.0.0.1` on ephemeral ports.
Zero online `gcloud` or `bq` calls are executed.
"""

from __future__ import annotations

import http.client
import json
import os
import pathlib
import sys
import threading
import unittest
import urllib.parse
from http.server import HTTPServer
from unittest import mock

REPO_DIR = pathlib.Path(__file__).resolve().parent
PORTAL_DIR = REPO_DIR / "portal"
if str(REPO_DIR) not in sys.path:
    sys.path.insert(0, str(REPO_DIR))
if str(PORTAL_DIR) not in sys.path:
    sys.path.insert(0, str(PORTAL_DIR))

import cloudrun_harvester_server  # noqa: E402
import deploy_cloudrun_harvester  # noqa: E402
import deploy_portal  # noqa: E402
import ge_harvest  # noqa: E402
import purview_connector  # noqa: E402
import setup_storage_and_bigquery  # noqa: E402
import server as portal_server  # noqa: E402


class TestEdiscoveryAntiSpoliationAndSecurity(unittest.TestCase):
    def test_ed1_sts_subject_policy_and_credential_access_boundary(self) -> None:
        """ED-1: STS subject allowlist/denylist + Discovery Engine Credential Access Boundary."""
        with mock.patch.dict(
            os.environ,
            {
                "ARCHIVER_DENIED_SUBJECTS": "ceo@agency.gov,admin@agency.gov",
                "ARCHIVER_ALLOWED_SUBJECT_DOMAINS": "agency.gov",
                "ARCHIVER_REQUIRE_EMAIL_SUBJECT": "true",
            },
            clear=False,
        ):
            # Denied VIP/admin subject is blocked before KMS signing
            with self.assertRaises(PermissionError):
                ge_harvest._validate_sts_subject_policy("ceo@agency.gov")
            # External domain is blocked
            with self.assertRaises(PermissionError):
                ge_harvest._validate_sts_subject_policy("user@other.org")
            # Non-email opaque subject blocked when ARCHIVER_REQUIRE_EMAIL_SUBJECT=true
            with self.assertRaises(PermissionError):
                ge_harvest._validate_sts_subject_policy("service-principal-id")
            # Authorized custodian passes
            ge_harvest._validate_sts_subject_policy("custodian@agency.gov")

        # Verify mint_sts_token attaches IAM Credential Access Boundary scoped to Discovery Engine
        captured_forms: list[str] = []

        def fake_urlopen(req, context=None, timeout=None):
            body = req.data.decode("utf-8") if req.data else ""
            captured_forms.append(body)
            resp = mock.MagicMock()
            resp.read.return_value = json.dumps(
                {"access_token": "sts_downscoped_tok", "expires_in": 900}
            ).encode("utf-8")
            resp.__enter__.return_value = resp
            return resp

        ge_harvest._STS_TOKEN_CACHE.clear()
        with (
            mock.patch.dict(
                os.environ,
                {
                    "ARCHIVER_ALLOWED_SUBJECT_DOMAINS": "agency.gov",
                    "ARCHIVER_REQUIRE_EMAIL_SUBJECT": "true",
                },
                clear=False,
            ),
            mock.patch.object(ge_harvest, "sign_jwt_with_kms", return_value=b"raw_kms_sig_bytes"),
            mock.patch("urllib.request.urlopen", side_effect=fake_urlopen),
        ):
            tok = ge_harvest.mint_sts_token(
                subject="custodian@agency.gov",
                project_id="my-compliance-proj",
                workforce_pool_id="ge-pool",
            )
            self.assertEqual(tok, "sts_downscoped_tok")
            self.assertEqual(len(captured_forms), 1)
            parsed = urllib.parse.parse_qs(captured_forms[0])
            self.assertIn("options", parsed)
            options_obj = json.loads(parsed["options"][0])
            rules = options_obj["accessBoundary"]["accessBoundaryRules"]
            self.assertEqual(
                rules[0]["availableResource"],
                "//discoveryengine.googleapis.com/projects/my-compliance-proj",
            )
            self.assertEqual(rules[0]["availablePermissions"], ["inRole:roles/discoveryengine.user"])

    def test_ed1_project_segment_fails_closed_when_project_id_empty(self) -> None:
        """ED-1: _is_allowed_project_segment must return False when PROJECT_ID is unset."""
        orig_proj = ge_harvest.PROJECT_ID
        try:
            ge_harvest.PROJECT_ID = ""
            with mock.patch.dict(os.environ, {"PROJECT_ID": "", "PROJECT_NUMBER": ""}, clear=False):
                self.assertFalse(ge_harvest._is_allowed_project_segment("attacker-project"))
        finally:
            ge_harvest.PROJECT_ID = orig_proj

    def test_ed2_immutable_notebook_turn_index_and_merge_file_preservation(self) -> None:
        """ED-2: NotebookLM turn_index is deterministic (< MAX_SAFE_INTEGER) and MERGE SQL union-merges T.files."""
        idx1 = ge_harvest.compute_immutable_notebook_turn_index(
            "2026-10-01T12:00:00Z", "q:Summarize FOIA policy"
        )
        idx2 = ge_harvest.compute_immutable_notebook_turn_index(
            "2026-10-01T12:00:00Z", "q:Summarize FOIA policy"
        )
        idx_later = ge_harvest.compute_immutable_notebook_turn_index(
            "2026-10-02T12:00:00Z", "q:Follow-up question"
        )
        self.assertEqual(idx1, idx2)
        self.assertGreater(idx1, 1)  # Never collides with turn_index=0 inventory or turn_index=1
        self.assertLess(idx_later, 9007199254740991)  # JS Number.MAX_SAFE_INTEGER
        self.assertGreater(idx_later, idx1)

        # Verify BigQuery MERGE SQL preserves historical ex.files via non-correlated ARRAY_CONCAT + ROW_NUMBER
        harvest_src = (REPO_DIR / "ge_harvest.py").read_text(encoding="utf-8")
        self.assertIn("UNNEST(ARRAY_CONCAT(st.files, IFNULL(ex.files, [])))", harvest_src)
        self.assertIn("files = S.merged_files", harvest_src)
        self.assertNotIn("extracted_text[:4000]", harvest_src)
        self.assertNotIn("ncontent[:4000]", harvest_src)

    def test_ed3_purview_journal_routing_resumable_upload_and_fail_closed(self) -> None:
        """ED-3: Dedicated compliance journal mailbox, turn_index=0 preservation, >3MB upload session, and fail-closed."""
        with mock.patch.dict(
            os.environ,
            {"PURVIEW_COMPLIANCE_JOURNAL_UPN": "ediscovery-journal@agency.gov"},
            clear=False,
        ):
            self.assertEqual(
                purview_connector.resolve_mailbox_target_upn("custodian@agency.gov"),
                "ediscovery-journal@agency.gov",
            )
            # Dedicated compliance journal retains thought_text by default
            self.assertTrue(
                purview_connector._should_include_thought_text(
                    "ediscovery-journal@agency.gov", "custodian@agency.gov"
                )
            )

        with mock.patch.dict(os.environ, {"PURVIEW_COMPLIANCE_JOURNAL_UPN": ""}, clear=False):
            # Writing directly to custodian mailbox suppresses internal thought_text unless explicitly enabled
            self.assertFalse(
                purview_connector._should_include_thought_text(
                    "custodian@agency.gov", "custodian@agency.gov"
                )
            )

        # Verify turn_index=0 (NotebookLM inventory) is preserved as Turn #0, not coerced to Turn #1
        html_body = purview_connector.build_legal_brief_html(
            {
                "session_id": "nb-123",
                "turn_index": 0,
                "prompt_text": "Ingested 3 sources",
                "response_text": "Inventory snapshot",
                "engine_id": "notebooklm-enterprise",
            },
            custodian_upn="custodian@agency.gov",
        )
        self.assertIn("Turn #0", html_body)

        # Verify >3MB attachments route to upload_large_attachment_to_message instead of silently dropping,
        # and duplicate entries + notebook_archive_<sha>.json snapshots are deduplicated/excluded.
        five_mb_payload = b"A" * (3 * 1024 * 1024 + 1024)
        sample_turn = {
            "session_id": "sess-99",
            "turn_index": 1,
            "query_id": "q-99",
            "user_iam_principal": (
                "principal://iam.googleapis.com/locations/global/workforcePools/p/subject/custodian@agency.gov"
            ),
            "prompt_text": "Upload large PDF",
            "response_text": "Processed",
            "files": [
                {
                    "file_name": "Evidence_Packet.pdf",
                    "mime_type": "application/pdf",
                    "gcs_uri": "gs://proj-ge-ediscovery/raw_sessions/sess-99/Evidence_Packet.pdf",
                    "sha256": "deadbeef",
                },
                {
                    "file_name": "Evidence_Packet.pdf",
                    "mime_type": "application/pdf",
                    "gcs_uri": "gs://proj-ge-ediscovery/raw_sessions/sess-99/Evidence_Packet.pdf",
                    "sha256": "deadbeef",
                },
                {
                    "file_name": "notebook_archive_0123456789abcdef.json",
                    "mime_type": "application/json",
                    "gcs_uri": "gs://proj-ge-ediscovery/notebooks/nb/notebook_archive_0123456789abcdef.json",
                },
            ],
        }
        with (
            mock.patch.dict(
                os.environ,
                {
                    "PURVIEW_COMPLIANCE_JOURNAL_UPN": "journal@agency.gov",
                    "PURVIEW_FAIL_CLOSED": "true",
                },
                clear=False,
            ),
            mock.patch.object(purview_connector, "ensure_compliance_mail_folder", return_value="folder_1"),
            mock.patch.object(purview_connector, "check_turn_already_ingested", return_value=None),
            mock.patch.object(purview_connector, "download_gcs_bytes", return_value=five_mb_payload),
            mock.patch.object(
                purview_connector,
                "graph_api_request",
                return_value={"id": "msg_1", "policyActions": []},
            ),
            mock.patch.object(purview_connector, "upload_large_attachment_to_message") as mock_large_upload,
        ):
            mbx_res = purview_connector.push_turn_to_purview_ediscovery_mailbox(
                sample_turn,
                graph_token="graph_tok",
                gcp_token="gcp_tok",
                project_id="proj",
            )
            self.assertEqual(mbx_res["status"], "created")
            self.assertEqual(mbx_res["mailbox_upn"], "journal@agency.gov")
            self.assertEqual(mbx_res["attachments_count"], 1)
            self.assertEqual(mbx_res["large_attachments_count"], 1)
            mock_large_upload.assert_called_once()

            fwd_res = purview_connector.forward_turns_to_purview(
                [sample_turn],
                gcp_token="gcp_tok",
                project_id="proj",
                graph_token="graph_tok",
            )
            self.assertEqual(fwd_res["mailbox_created"], 1)

        # Verify PURVIEW_FAIL_CLOSED=true raises RuntimeError when Graph returns an error
        with (
            mock.patch.dict(
                os.environ,
                {"PURVIEW_FAIL_CLOSED": "true"},
                clear=False,
            ),
            mock.patch.object(
                purview_connector,
                "ensure_compliance_mail_folder",
                side_effect=RuntimeError("Graph 503 Unavailable"),
            ),
        ):
            with self.assertRaises(RuntimeError):
                purview_connector.forward_turns_to_purview(
                    [
                        {
                            "session_id": "sess-err",
                            "turn_index": 1,
                            "user_iam_principal": (
                                "principal://iam.googleapis.com/locations/global/workforcePools/p/subject/custodian@agency.gov"
                            ),
                        }
                    ],
                    gcp_token="gcp_tok",
                    project_id="proj",
                    graph_token="graph_tok",
                )

    def test_ed4_setup_storage_worm_flags_greenfield_guard_and_transcript_uri(self) -> None:
        """ED-4: Valid --no-versioning / --lock-retention-period flags, greenfield bq show check, and content-addressed URI."""
        setup_src = (REPO_DIR / "setup_storage_and_bigquery.py").read_text(encoding="utf-8")
        self.assertNotIn("--clear-Versioning", setup_src)
        self.assertIn('"--no-versioning"', setup_src)
        self.assertIn('"--lock-retention-period"', setup_src)
        self.assertNotIn("/session_transcript.json", setup_src)
        self.assertIn("ARRAY_AGG(session_transcript_gcs_uri IGNORE NULLS", setup_src)
        self.assertIn("v_ediscovery_custodian_export", setup_src)
        self.assertIn('NOT jsonPayload.logMetadata.methodName="Search"', setup_src)
        self.assertIn('jsonPayload.logMetadata.methodName="StreamAssist"', setup_src)

        # Verify ensure_bq_views_and_functions succeeds on a greenfield project where raw sink table does not exist yet
        executed_queries: list[str] = []

        def fake_subprocess_run(cmd, *args, **kwargs):
            if len(cmd) >= 3 and cmd[0] == "bq" and "show" in cmd:
                return mock.MagicMock(returncode=1, stdout="", stderr="Not found: Table")
            if cmd and cmd[0] == "bq" and "query" in cmd:
                executed_queries.append(cmd[-1])
                return mock.MagicMock(returncode=0, stdout="", stderr="")
            return mock.MagicMock(returncode=0, stdout="", stderr="")

        orig_proj = setup_storage_and_bigquery.PROJECT_ID
        try:
            setup_storage_and_bigquery.PROJECT_ID = "greenfield-proj"
            with mock.patch("subprocess.run", side_effect=fake_subprocess_run):
                setup_storage_and_bigquery.ensure_bq_views_and_functions()
        finally:
            setup_storage_and_bigquery.PROJECT_ID = orig_proj

        self.assertTrue(len(executed_queries) >= 1)
        combined_sql = "\n".join(executed_queries)
        self.assertNotIn(
            "discoveryengine_googleapis_com_gemini_enterprise_user_activity",
            combined_sql,
        )
        self.assertIn("v_realtime_agent_and_file_activity", combined_sql)
        self.assertIn("v_ediscovery_custodian_export", combined_sql)

    def test_ed5_cloudrun_harvester_oidc_fail_closed_and_least_privilege_iam(self) -> None:
        """ED-5: Harvester rejects missing EXPECTED_OIDC_AUDIENCE in Cloud Run and removes storage.objectAdmin."""
        deploy_src = (REPO_DIR / "deploy_cloudrun_harvester.py").read_text(encoding="utf-8")
        self.assertNotIn("roles/storage.objectAdmin", deploy_src)
        self.assertIn("roles/storage.objectCreator", deploy_src)
        self.assertIn("roles/storage.objectViewer", deploy_src)
        self.assertIn("--set-secrets", deploy_src)

        import base64
        import time

        hdr = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "kid": "k1"}).encode()).decode().rstrip("=")
        now = int(time.time())
        claims = base64.urlsafe_b64encode(
            json.dumps(
                {
                    "iss": "https://accounts.google.com",
                    "aud": "https://attacker.example",
                    "email": "ge-ediscovery-harvester-sa@proj.iam.gserviceaccount.com",
                    "email_verified": True,
                    "iat": now,
                    "exp": now + 300,
                }
            ).encode()
        ).decode().rstrip("=")
        fake_handler = mock.MagicMock()
        fake_handler.headers = {"Authorization": f"Bearer {hdr}.{claims}.c2ln"}

        with mock.patch.dict(
            os.environ,
            {"K_SERVICE": "ge-ediscovery-harvester", "EXPECTED_OIDC_AUDIENCE": ""},
            clear=False,
        ):
            ok, reason = cloudrun_harvester_server.HarvesterRequestHandler._verify_oidc_caller(fake_handler)
            self.assertFalse(ok)
            self.assertIn("EXPECTED_OIDC_AUDIENCE", reason)

    def test_ed6_ed7_portal_server_fail_closed_auth_rbac_csp_and_methods(self) -> None:
        """ED-6/ED-7/ED-8: Live loopback HTTP tests on 127.0.0.1 verifying 401, 403, 405, and strict CSP."""
        deploy_portal_src = (REPO_DIR / "deploy_portal.py").read_text(encoding="utf-8")
        self.assertNotIn("roles/bigquery.dataViewer", deploy_portal_src)
        self.assertNotIn("domain:example.com", deploy_portal_src)

        with mock.patch.dict(
            os.environ,
            {
                "K_SERVICE": "ge-compliance-portal",
                "ALLOW_LOCAL_DEV_BYPASS": "true",
                "IAP_AUDIENCE": "/projects/111/global/backendServices/222",
                "EXPECTED_OAUTH_CLIENT_ID": "portal-client.apps.googleusercontent.com",
                "ALLOWED_REVIEWER_EMAILS": "counsel@agency.gov",
            },
            clear=False,
        ):
            httpd = HTTPServer(("127.0.0.1", 0), portal_server.PortalRequestHandler)
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                # 1. Unauthenticated /api/config -> 401 (even with spoofed X-Goog-Authenticated-User-Email!)
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request(
                    "GET",
                    "/api/config",
                    headers={"X-Goog-Authenticated-User-Email": "accounts.google.com:counsel@agency.gov"},
                )
                resp = conn.getresponse()
                body = resp.read().decode("utf-8")
                self.assertEqual(resp.status, 401, body)
                csp = resp.getheader("Content-Security-Policy") or ""
                self.assertNotIn("cdnjs.cloudflare.com", csp)
                self.assertEqual(resp.getheader("X-Content-Type-Options"), "nosniff")
                conn.close()

                # 2. Disallowed HTTP method POST -> 405 Method Not Allowed
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("POST", "/api/logs")
                resp = conn.getresponse()
                resp.read()
                self.assertEqual(resp.status, 405)
                conn.close()

                # 3. Authenticated via IAP JWT, but caller NOT in ALLOWED_REVIEWER_EMAILS -> 403 Forbidden
                with mock.patch.object(
                    portal_server,
                    "_verify_es256_iap_jwt",
                    return_value=("outsider@agency.gov", "outsider"),
                ):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request(
                        "GET",
                        "/api/config",
                        headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"},
                    )
                    resp = conn.getresponse()
                    resp.read()
                    self.assertEqual(resp.status, 403)
                    conn.close()

                # 4. Authenticated + Authorized reviewer -> 200 OK
                with mock.patch.object(
                    portal_server,
                    "_verify_es256_iap_jwt",
                    return_value=("counsel@agency.gov", "counsel"),
                ):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request(
                        "GET",
                        "/api/config",
                        headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"},
                    )
                    resp = conn.getresponse()
                    cfg = json.loads(resp.read().decode("utf-8"))
                    self.assertEqual(resp.status, 200)
                    self.assertEqual(cfg["reviewer_email"], "counsel@agency.gov")
                    conn.close()
            finally:
                httpd.shutdown()
                httpd.server_close()

    def test_ed7_ed8_portal_frontend_zero_unsafe_dom_sinks_or_cdn_loaders(self) -> None:
        """ED-7/ED-8: Verify zero dangerouslySetInnerHTML, .innerHTML, token query params, or cdnjs in portal/src."""
        src_root = PORTAL_DIR / "src"
        for path in src_root.rglob("*"):
            if not path.is_file():
                continue
            content = path.read_text(encoding="utf-8")
            rel = str(path.relative_to(PORTAL_DIR))
            self.assertNotIn("dangerouslySetInnerHTML", content, f"Unsafe sink in {rel}")
            self.assertNotIn(".innerHTML", content, f"Unsafe .innerHTML in {rel}")
            self.assertNotIn(".outerHTML", content, f"Unsafe .outerHTML in {rel}")
            self.assertNotIn("cdnjs.cloudflare.com", content, f"Unpinned CDN in {rel}")
            self.assertNotIn("iap-managed-session", content, f"Synthetic auth token in {rel}")
            self.assertNotIn("&token=", content, f"Token in URL query param in {rel}")

    def test_portal_gcs_media_headers_omit_x_goog_user_project_by_default(self) -> None:
        """Regression test: storage.googleapis.com calls omit X-Goog-User-Project so least-privilege portal SA never hits 403."""
        with mock.patch.dict(os.environ, {"GCS_USER_PROJECT": ""}, clear=False):
            hdrs = portal_server._build_gcs_headers("tok-123")
            self.assertEqual(hdrs, {"Authorization": "Bearer tok-123"})
            self.assertNotIn("X-Goog-User-Project", hdrs)

    def test_bq_merge_deduplicates_existing_files_cte_and_locks(self) -> None:
        """Regression test: BigQuery MERGE pre-aggregates existing_files by (session_id, turn_index) so concurrent turns never cause HTTP 400."""
        harvest_src = (REPO_DIR / "ge_harvest.py").read_text(encoding="utf-8")
        self.assertIn("existing_files AS (", harvest_src)
        self.assertIn("GROUP BY session_id, turn_index", harvest_src)
        self.assertIn("ARRAY_CONCAT_AGG(files) AS files", harvest_src)
        self.assertIn("LEFT JOIN existing_files AS ex", harvest_src)
        self.assertIn("_BQ_MERGE_LOCK", harvest_src)

    def test_purview_verify_compliance_mail_folder_and_hex_id(self) -> None:
        """Verify verify_compliance_mail_folder inspects hidden folders, computes 24-byte hex Folder ID, and lists messages."""
        import base64

        fake_entry_bytes = b"\x00" * 22 + bytes.fromhex("89EC3B872F385144AB16EBBA27EA202F0000234A3AA20000")
        fake_entry_b64 = base64.b64encode(fake_entry_bytes).decode("ascii")

        def fake_graph_api(method: str, url: str, graph_token: str, payload=None):
            if "mailFolders?includeHiddenFolders=true" in url:
                return {
                    "value": [
                        {
                            "id": "folder-rest-123",
                            "displayName": "Gemini Enterprise eDiscovery",
                            "isHidden": True,
                            "totalItemCount": 3,
                            "unreadItemCount": 0,
                        }
                    ]
                }
            if "translateExchangeIds" in url:
                return {"value": [{"sourceId": "folder-rest-123", "targetId": fake_entry_b64}]}
            if "/messages?" in url:
                return {
                    "value": [
                        {
                            "subject": "[Gemini Enterprise eDiscovery] Test Turn",
                            "receivedDateTime": "2026-11-04T20:00:00Z",
                            "from": {"emailAddress": {"address": "custodian@agency.gov"}},
                            "internetMessageId": "<test@gemini.cloud.google.com>",
                            "hasAttachments": True,
                            "attachments": [{"name": "doc.pdf", "contentType": "application/pdf", "size": 1024}],
                        }
                    ]
                }
            return {}

        with mock.patch.object(purview_connector, "graph_api_request", side_effect=fake_graph_api):
            rep = purview_connector.verify_compliance_mail_folder("custodian@agency.gov", "graph_tok")
            self.assertTrue(rep["folder_found"])
            self.assertTrue(rep["is_hidden"])
            self.assertEqual(rep["total_item_count"], 3)
            self.assertEqual(
                rep["purview_kql_folderid_query"],
                "folderid:89EC3B872F385144AB16EBBA27EA202F0000234A3AA20000",
            )
            self.assertEqual(len(rep["recent_messages"]), 1)
            self.assertEqual(rep["recent_messages"][0]["attachments"][0]["name"], "doc.pdf")

    def test_top5_claude_review_remediations(self) -> None:
        """Verify B1 (fail-closed STS mint), B3 (late attachment append), B5 (fail-closed unresolved OID), B6/B9, C2/B10."""
        # 1. C2 + B10: Scoped existing_files CTE + fast CRC32C lookup table
        harvest_src = (REPO_DIR / "ge_harvest.py").read_text(encoding="utf-8")
        self.assertIn("AND session_id IN (SELECT DISTINCT session_id FROM dedup_staging)", harvest_src)
        self.assertIn("_CRC32C_TABLE", harvest_src)
        self.assertEqual(ge_harvest.compute_crc32c_base64(b"123456789"), "4waSgw==")

        # 2. B9: deploy_cloudrun_harvester.py passes all PURVIEW_* and ARCHIVER_* env vars
        deploy_src = (REPO_DIR / "deploy_cloudrun_harvester.py").read_text(encoding="utf-8")
        for var_name in (
            "PURVIEW_HIDE_FOLDER",
            "PURVIEW_INCLUDE_THOUGHT_TEXT",
            "PURVIEW_MAX_ATTACHMENT_MB",
            "PURVIEW_MESSAGE_CLASS",
            "ARCHIVER_REQUIRE_EMAIL_SUBJECT",
            "FALLBACK_PRINCIPALS",
            "DISABLE_STS_ACCESS_BOUNDARY",
        ):
            self.assertIn(f'"{var_name}"', deploy_src)

        # 3. B1: get_token_for_principal raises when mint_sts_token fails on a WIF principal instead of falling back to SA token
        with mock.patch.object(ge_harvest, "mint_sts_token", side_effect=RuntimeError("KMS unavailable")):
            with self.assertRaises(RuntimeError):
                ge_harvest.get_token_for_principal(
                    "principal://iam.googleapis.com/locations/global/workforcePools/p/subject/user@agency.gov",
                    "proj",
                    "p",
                )

        # 4. B5: push_turn_to_purview_ediscovery_mailbox raises RuntimeError when OID cannot be resolved and PURVIEW_FAIL_CLOSED=true
        with (
            mock.patch.dict(
                os.environ,
                {
                    "PURVIEW_FAIL_CLOSED": "true",
                    "PURVIEW_COMPLIANCE_JOURNAL_UPN": "",
                    "PURVIEW_FALLBACK_UPN": "",
                },
                clear=False,
            ),
            mock.patch.object(purview_connector, "PURVIEW_COMPLIANCE_JOURNAL_UPN", ""),
            mock.patch.object(purview_connector, "PURVIEW_FALLBACK_UPN", ""),
            mock.patch.object(purview_connector, "PURVIEW_TARGET_CUSTODIAN_UPN", ""),
            mock.patch.object(purview_connector, "graph_api_request", side_effect=RuntimeError("403 Forbidden User.Read.All")),
        ):
            with self.assertRaises(RuntimeError):
                purview_connector.push_turn_to_purview_ediscovery_mailbox(
                    {
                        "session_id": "sess-oid",
                        "turn_index": 1,
                        "user_iam_principal": (
                            "principal://iam.googleapis.com/locations/global/workforcePools/p/subject/"
                            "11111111-2222-3333-4444-555555555555"
                        ),
                    },
                    graph_token="not-a-jwt",
                )

        # 5. B3: Existing Purview message receives late-arriving attachment via POST /messages/{id}/attachments
        posted_attachments = []

        def fake_graph_b3(method: str, url: str, graph_token: str, payload=None):
            if method == "GET" and "/attachments?$select=name" in url:
                return {"value": [{"name": "first_file.txt"}]}
            if method == "POST" and url.endswith("/attachments"):
                posted_attachments.append(payload)
                return {"id": "att-new"}
            return {}

        with (
            mock.patch.object(purview_connector, "ensure_compliance_mail_folder", return_value="fld-1"),
            mock.patch.object(purview_connector, "check_turn_already_ingested", return_value="msg-existing-1"),
            mock.patch.object(purview_connector, "graph_api_request", side_effect=fake_graph_b3),
        ):
            res_b3 = purview_connector.push_turn_to_purview_ediscovery_mailbox(
                {
                    "session_id": "sess-b3",
                    "turn_index": 1,
                    "user_iam_principal": "principal://iam.googleapis.com/locations/global/workforcePools/p/subject/u@agency.gov",
                    "files": [
                        {
                            "file_id": "f1",
                            "file_name": "first_file.txt",
                            "mime_type": "text/plain",
                            "_raw_bytes": b"already there",
                        },
                        {
                            "file_id": "f2",
                            "file_name": "late_arrival.pdf",
                            "mime_type": "application/pdf",
                            "_raw_bytes": b"%PDF-1.4 late file",
                        },
                    ],
                },
                graph_token="graph_tok",
            )
        self.assertEqual(res_b3["status"], "updated_attachments")
        self.assertEqual(res_b3["appended_attachments_count"], 1)
        self.assertEqual(len(posted_attachments), 1)
        self.assertEqual(posted_attachments[0]["name"], "late_arrival.pdf")

    def test_wif_portal_identity_extraction_and_pool_authorization(self) -> None:
        """Verify Workforce Identity Federation (WIF) IAP claim extraction and ALLOWED_WIF_POOLS authorization."""
        import deploy_portal_wif

        self.assertEqual(
            deploy_portal_wif.normalize_wif_pool_id(
                "https://auth.cloud.google/signin-callback/locations/global/workforcePools/entrapf-id-oidc-pool/providers/entrapf-id-oidc-pool-provider"
            ),
            "entrapf-id-oidc-pool",
        )
        self.assertEqual(
            deploy_portal_wif.normalize_wif_provider_id(
                "https://auth.cloud.google/signin-callback/locations/global/workforcePools/entrapf-id-oidc-pool/providers/entrapf-id-oidc-pool-provider"
            ),
            "entrapf-id-oidc-pool-provider",
        )

        wif_claims = {
            "iss": "https://cloud.google.com/iap",
            "aud": "/projects/111/locations/us-central1/services/ge-ediscovery-portal-wif",
            "identity_source": "workforce_identity",
            "email": "auditor@agency.gov",
            "workforce_identity": {
                "workforce_pool_name": "locations/global/workforcePools/entrapf-id-oidc-pool",
                "iam_principal": (
                    "principal://iam.googleapis.com/locations/global/workforcePools/"
                    "entrapf-id-oidc-pool/subject/auditor@agency.gov"
                ),
            },
        }
        rev_id, disp, pool_id = portal_server._extract_iap_wif_identity(wif_claims)
        self.assertEqual(rev_id, "auditor@agency.gov")
        self.assertEqual(disp, "auditor")
        self.assertEqual(pool_id, "entrapf-id-oidc-pool")

        with mock.patch.dict(
            os.environ,
            {
                "K_SERVICE": "ge-ediscovery-portal-wif",
                "ALLOWED_WIF_POOLS": "entrapf-id-oidc-pool",
                "ALLOWED_REVIEWER_EMAILS": "",
                "ALLOWED_REVIEWER_DOMAINS": "",
            },
            clear=False,
        ):
            self.assertTrue(portal_server.is_reviewer_authorized("auditor@agency.gov"))

    def test_auditor_query_session_view_export_and_bq_sink_views(self) -> None:
        """Verify full auditor search query logging, POST /api/audit events, and v_portal_auditor_activity DDL."""
        emitted_entries: list[dict] = []

        def capture_audit(handler_self, reviewer_email: str, action: str, target: str, extra: dict | None = None):
            entry = portal_server._build_canonical_audit_entry(
                reviewer_email=reviewer_email,
                action=action,
                target=target,
                remote_ip="127.0.0.1",
                extra=extra,
            )
            emitted_entries.append(entry)

        fake_bq_rows = [
            {
                "session_id": "sess-audit-1",
                "turn_index": 1,
                "query_id": "q1",
                "assist_answer_id": "a1",
                "engine_id": "ge-engine-1",
                "location": "global",
                "user_iam_principal": "custodian@agency.gov",
                "session_display_name": "FOIA Review",
                "prompt_text": "Confidential procurement memo",
                "response_text": "Summary response",
                "thought_text": "",
                "model_name": "gemini-3.8-flash",
                "session_transcript_gcs_uri": "gs://proj-ge-ediscovery/raw_sessions/sess-audit-1.json",
                "session_transcript_console_url": "",
                "files": [],
                "event_timestamp": "2026-11-18T12:00:00Z",
                "harvested_at": "2026-11-18T12:00:05Z",
            }
        ]

        with (
            mock.patch.dict(
                os.environ,
                {
                    "K_SERVICE": "ge-ediscovery-portal-wif",
                    "IAP_AUDIENCE": "/projects/111/locations/us-central1/services/ge-ediscovery-portal-wif",
                    "ALLOWED_WIF_POOLS": "entrapf-auditors-pool",
                    "ALLOWED_REVIEWER_EMAILS": "",
                    "ALLOWED_REVIEWER_DOMAINS": "",
                    "AUDIT_REDACT_SEARCH_TEXT": "false",
                },
                clear=False,
            ),
            mock.patch.object(portal_server, "_verify_es256_iap_jwt", return_value=("auditor@agency.gov", "auditor")),
            mock.patch.object(portal_server, "run_bq_query", return_value=fake_bq_rows),
            mock.patch.object(portal_server.PortalRequestHandler, "emit_access_audit_log", capture_audit),
        ):
            httpd = HTTPServer(("127.0.0.1", 0), portal_server.PortalRequestHandler)
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                # 1. GET /api/search captures exact query_text, matched_count, and matched_sessions_csv
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request(
                    "GET",
                    "/api/search?q=procurement+memo&user_email=custodian%40agency.gov",
                    headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"},
                )
                resp = conn.getresponse()
                resp.read()
                self.assertEqual(resp.status, 200)
                conn.close()

                # 2. POST /api/audit logs VIEW_SESSION_TRANSCRIPT and EXPORT_LEGAL_BRIEF
                for payload in (
                    {
                        "action": "VIEW_SESSION_TRANSCRIPT",
                        "session_id": "sess-audit-1",
                        "custodian_email": "custodian@agency.gov",
                        "surface": "GEMINI_ENTERPRISE_CHAT",
                    },
                    {
                        "action": "EXPORT_LEGAL_BRIEF",
                        "session_id": "sess-audit-1",
                        "custodian_email": "custodian@agency.gov",
                        "surface": "GEMINI_ENTERPRISE_CHAT",
                        "export_format": "PDF_PRINT",
                    },
                    {
                        "action": "FILTER_SESSIONS",
                        "query_text": "FOIA",
                        "filtered_user": "custodian@agency.gov",
                        "matched_count": 3,
                        "matched_sessions_csv": "sess-audit-1,sess-audit-2,sess-audit-3",
                        "surface": "GEMINI_ENTERPRISE_CHAT",
                    },
                ):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request(
                        "POST",
                        "/api/audit",
                        body=json.dumps(payload).encode("utf-8"),
                        headers={
                            "Content-Type": "application/json",
                            "X-Goog-IAP-JWT-Assertion": "valid.es256.jwt",
                        },
                    )
                    resp = conn.getresponse()
                    resp.read()
                    self.assertEqual(resp.status, 200)
                    conn.close()

                # 3. Unsupported audit action returns 400
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request(
                    "POST",
                    "/api/audit",
                    body=json.dumps({"action": "DROP_TABLE"}).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "X-Goog-IAP-JWT-Assertion": "valid.es256.jwt",
                    },
                )
                resp = conn.getresponse()
                resp.read()
                self.assertEqual(resp.status, 400)
                conn.close()
            finally:
                httpd.shutdown()
                httpd.server_close()

        self.assertEqual(len(emitted_entries), 4)
        search_entry = emitted_entries[0]
        self.assertEqual(search_entry["action"], "SEARCH_COMPLIANCE_LOGS")
        self.assertEqual(search_entry["query_text"], "procurement memo")
        self.assertEqual(search_entry["filtered_user"], "custodian@agency.gov")
        self.assertEqual(search_entry["matched_count"], 1)
        self.assertEqual(search_entry["matched_sessions_csv"], "sess-audit-1")

        view_entry = emitted_entries[1]
        self.assertEqual(view_entry["action"], "VIEW_SESSION_TRANSCRIPT")
        self.assertEqual(view_entry["session_id"], "sess-audit-1")
        self.assertEqual(view_entry["custodian_email"], "custodian@agency.gov")

        export_entry = emitted_entries[2]
        self.assertEqual(export_entry["action"], "EXPORT_LEGAL_BRIEF")
        self.assertEqual(export_entry["export_format"], "PDF_PRINT")

        filter_sess_entry = emitted_entries[3]
        self.assertEqual(filter_sess_entry["action"], "FILTER_SESSIONS")
        self.assertEqual(filter_sess_entry["query_text"], "FOIA")
        self.assertEqual(filter_sess_entry["filtered_user"], "custodian@agency.gov")
        self.assertEqual(filter_sess_entry["matched_count"], 3)
        self.assertEqual(filter_sess_entry["matched_sessions_csv"], "sess-audit-1,sess-audit-2,sess-audit-3")

        # 4. Verify setup_storage_and_bigquery.py emits v_portal_auditor_activity + fn_auditor_access_report
        #    when run_googleapis_com_stdout exists
        captured_ddl: list[str] = []

        def fake_bq_run_with_stdout_table(cmd, *args, **kwargs):
            if cmd and cmd[0] == "bq" and "show" in cmd:
                return mock.MagicMock(returncode=0, stdout="", stderr="")
            if cmd and cmd[0] == "bq" and "query" in cmd:
                captured_ddl.append(cmd[-1])
                return mock.MagicMock(returncode=0, stdout="", stderr="")
            return mock.MagicMock(returncode=0, stdout="", stderr="")

        orig_proj = setup_storage_and_bigquery.PROJECT_ID
        try:
            setup_storage_and_bigquery.PROJECT_ID = "active-proj"
            with mock.patch("subprocess.run", side_effect=fake_bq_run_with_stdout_table):
                setup_storage_and_bigquery.ensure_bq_views_and_functions()
        finally:
            setup_storage_and_bigquery.PROJECT_ID = orig_proj

        ddl_joined = "\n".join(captured_ddl)
        self.assertIn("v_portal_auditor_activity", ddl_joined)
        self.assertIn("fn_auditor_access_report", ddl_joined)
        self.assertIn("run_googleapis_com_stdout", ddl_joined)

    def test_auditor_activity_workspace_api_and_admin_allowlist(self) -> None:
        """Verify GET /api/auditor-logs merges BQ + ring buffer, deduplicates +/-5s, and enforces AUDIT_ADMIN_EMAILS."""
        fake_bq_audit_rows = [
            {
                "event_timestamp": "2026-11-19T01:54:04Z",
                "portal_service": "ge-ediscovery-portal-wif",
                "auditor_email": "auditor@agency.gov",
                "action": "SEARCH_COMPLIANCE_LOGS",
                "search_query": "gold",
                "query_length": 4,
                "filtered_custodian": "custodian@agency.gov",
                "matched_session_count": 3,
                "matched_session_ids": "sess-1,sess-2,sess-3",
                "viewed_or_exported_session_id": "",
                "session_custodian_email": "",
                "surface": "",
                "export_format": "",
                "target_resource": "active-proj.ge_ediscovery.conversation_turns",
                "is_file_download": "false",
                "is_force_refresh": "false",
                "auditor_remote_ip": "127.0.0.1",
                "severity": "INFO",
            }
        ]

        with portal_server._CACHE_LOCK:
            portal_server._RECENT_AUDIT_RING.clear()
            # Duplicate of BQ row 1 second earlier -> should deduplicate cleanly
            portal_server._RECENT_AUDIT_RING.append({
                "severity": "INFO",
                "event_type": "ediscovery_portal_access_audit",
                "portal_service": "ge-ediscovery-portal-wif",
                "reviewer_email": "auditor@agency.gov",
                "action": "SEARCH_COMPLIANCE_LOGS",
                "target": "active-proj.ge_ediscovery.conversation_turns",
                "query_text": "gold",
                "query_length": 4,
                "filtered_user": "custodian@agency.gov",
                "matched_count": 3,
                "matched_sessions_csv": "sess-1,sess-2,sess-3",
                "session_id": "",
                "custodian_email": "",
                "surface": "",
                "export_format": "",
                "download": False,
                "force_refresh": False,
                "remote_ip": "127.0.0.1",
                "timestamp": "2026-11-19T01:54:03Z",
            })
            # Fresh in-memory event not yet flushed to BQ -> should appear immediately
            portal_server._RECENT_AUDIT_RING.append({
                "severity": "INFO",
                "event_type": "ediscovery_portal_access_audit",
                "portal_service": "ge-ediscovery-portal-wif",
                "reviewer_email": "auditor@agency.gov",
                "action": "VIEW_SESSION_TRANSCRIPT",
                "target": "sess-1",
                "query_text": "",
                "query_length": 0,
                "filtered_user": "",
                "matched_count": 0,
                "matched_sessions_csv": "",
                "session_id": "sess-1",
                "custodian_email": "custodian@agency.gov",
                "surface": "GEMINI_ENTERPRISE_CHAT",
                "export_format": "",
                "download": False,
                "force_refresh": False,
                "remote_ip": "127.0.0.1",
                "timestamp": "2026-11-19T01:55:10Z",
            })

        with (
            mock.patch.dict(
                os.environ,
                {
                    "K_SERVICE": "ge-ediscovery-portal-wif",
                    "IAP_AUDIENCE": "/projects/111/locations/us-central1/services/ge-ediscovery-portal-wif",
                    "ALLOWED_WIF_POOLS": "entrapf-auditors-pool",
                    "AUDIT_ADMIN_EMAILS": "",
                },
                clear=False,
            ),
            mock.patch.object(portal_server, "PROJECT_ID", "active-proj"),
            mock.patch.object(portal_server, "_verify_es256_iap_jwt", return_value=("auditor@agency.gov", "auditor")),
            mock.patch.object(portal_server, "run_bq_query", return_value=fake_bq_audit_rows),
        ):
            httpd = HTTPServer(("127.0.0.1", 0), portal_server.PortalRequestHandler)
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/api/config", headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"})
                cfg_resp = conn.getresponse()
                cfg_body = json.loads(cfg_resp.read().decode("utf-8"))
                self.assertEqual(cfg_resp.status, 200)
                self.assertTrue(cfg_body["can_view_auditor_logs"])
                conn.close()

                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", "/api/auditor-logs?limit=100", headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"})
                log_resp = conn.getresponse()
                log_body = json.loads(log_resp.read().decode("utf-8"))
                self.assertEqual(log_resp.status, 200)
                self.assertEqual(log_body["count"], 2)
                self.assertEqual(log_body["events"][0]["action"], "VIEW_SESSION_TRANSCRIPT")
                self.assertEqual(log_body["events"][1]["search_query"], "gold")
                conn.close()

                # Restrict AUDIT_ADMIN_EMAILS to lead-counsel@agency.gov -> auditor@agency.gov gets 403
                with mock.patch.dict(os.environ, {"AUDIT_ADMIN_EMAILS": "lead-counsel@agency.gov"}, clear=False):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request("GET", "/api/config", headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"})
                    cfg_resp2 = conn.getresponse()
                    cfg_body2 = json.loads(cfg_resp2.read().decode("utf-8"))
                    self.assertFalse(cfg_body2["can_view_auditor_logs"])
                    conn.close()

                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request("GET", "/api/auditor-logs", headers={"X-Goog-IAP-JWT-Assertion": "valid.es256.jwt"})
                    denied_resp = conn.getresponse()
                    denied_resp.read()
                    self.assertEqual(denied_resp.status, 403)
                    conn.close()
            finally:
                httpd.shutdown()
                httpd.server_close()
                with portal_server._CACHE_LOCK:
                    portal_server._RECENT_AUDIT_RING.clear()


if __name__ == "__main__":
    unittest.main()
