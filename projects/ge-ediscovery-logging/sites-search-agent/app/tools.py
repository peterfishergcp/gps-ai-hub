# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Tools for the Google Sites Search Agent, including enterprise search and PDF generation."""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

import google.auth
from fpdf import FPDF
from google.adk.tools import ToolContext
from google.auth.transport.requests import Request
from google.genai import types

def _get_target_project() -> str:
    """Resolve the target GCP project ID or number from environment or ADC."""
    proj = (
        os.environ.get("GOOGLE_SITES_PROJECT_NUMBER")
        or os.environ.get("GOOGLE_SITES_PROJECT_ID")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
    )
    if proj:
        return proj
    try:
        _, default_proj = google.auth.default()
        return default_proj or ""
    except Exception:
        return ""


DATASTORE_ID = os.environ.get("GOOGLE_SITES_DATASTORE_ID", "")
FALLBACK_ENGINES = [
    e.strip()
    for e in os.environ.get("GOOGLE_SITES_FALLBACK_ENGINES", "").split(",")
    if e.strip()
]

_UNICODE_REPLACEMENTS = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "--",
    "\u2022": "*",
    "\u2026": "...",
    "\u2192": "->",
    "\u2190": "<-",
    "\u2194": "<->",
    "\u2265": ">=",
    "\u2264": "<=",
    "\u2260": "!=",
    "\u00b1": "+/-",
    "\u03b1": "alpha",
    "\u03b2": "beta",
    "\u03b3": "gamma",
    "\u03b4": "delta",
    "\u03c0": "pi",
    "\u03c8": "psi",
    "\u03a6": "Phi",
    "\u03a8": "Psi",
    "\u27e8": "<",
    "\u27e9": ">",
    "\u00a0": " ",
}


def _sanitize_pdf_text(text: str) -> str:
    """Normalize Unicode punctuation/math symbols into Latin-1 safe text for FPDF core fonts."""
    if not text:
        return ""
    for src, dst in _UNICODE_REPLACEMENTS.items():
        text = text.replace(src, dst)
    # Strip markdown bold/italic markers for clean plain-text rendering where needed
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _strip_md_inline(text: str) -> str:
    """Remove inline markdown bold/italic/code markers while keeping readable text."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return _sanitize_pdf_text(text)


class _SummaryPDF(FPDF):
    """Custom FPDF class with enterprise header and page-numbered footer."""

    def __init__(self, doc_title: str, doc_subtitle: str) -> None:
        super().__init__(orientation="P", unit="mm", format="Letter")
        self.doc_title = _strip_md_inline(doc_title)
        self.doc_subtitle = _strip_md_inline(doc_subtitle)
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(left=16, top=16, right=16)

    def header(self) -> None:
        if self.page_no() == 1:
            # Top banner on page 1
            self.set_fill_color(26, 115, 232)  # Google Blue
            self.rect(0, 0, 215.9, 28, style="F")
            self.set_xy(16, 6)
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(255, 255, 255)
            self.cell(
                0,
                8,
                self.doc_title[:85],
                new_x="LMARGIN",
                new_y="NEXT",
            )
            if self.doc_subtitle:
                self.set_x(16)
                self.set_font("Helvetica", "", 10)
                self.set_text_color(232, 240, 254)
                self.cell(
                    0,
                    6,
                    self.doc_subtitle[:110],
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
            self.set_y(33)
        else:
            # Compact running header on subsequent pages
            self.set_y(10)
            self.set_font("Helvetica", "I", 8.5)
            self.set_text_color(100, 110, 120)
            self.cell(
                0,
                5,
                f"{self.doc_title[:75]}  |  Google Sites Search Agent",
                new_x="LMARGIN",
                new_y="NEXT",
            )
            self.set_draw_color(218, 220, 224)
            self.line(16, 16, 199.9, 16)
            self.set_y(20)

    def footer(self) -> None:
        self.set_y(-13)
        self.set_draw_color(218, 220, 224)
        self.line(16, self.get_y(), 199.9, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(110, 115, 125)
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        self.cell(
            120,
            5,
            f"Generated by Google Sites Search Agent (ADK)  |  {now_str}",
            align="L",
        )
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")


def _extract_bearer_token(tool_context: ToolContext | None) -> str:
    """Extract user OAuth token from ToolContext state if available, else ADC token."""
    if tool_context is not None and hasattr(tool_context, "state"):
        try:
            state_dict = (
                tool_context.state.to_dict()
                if hasattr(tool_context.state, "to_dict")
                else dict(tool_context.state)
            )
            for k, v in state_dict.items():
                if k.startswith("temp:") and isinstance(v, str) and len(v) > 20:
                    return v
        except Exception:
            pass

    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    if not creds.valid:
        creds.refresh(Request())
    return creds.token or ""


def search_google_sites(
    query: str,
    page_size: int,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Searches enterprise Google Sites and connected knowledge stores for relevant pages and presentations.

    Args:
        query: The search keywords or question to look up in Google Sites.
        page_size: Maximum number of search results to return (e.g., 5).

    Returns:
        A dictionary containing 'query', 'results_count', and 'results' list with title, link, and snippet.
    """
    target_project = _get_target_project()
    token = _extract_bearer_token(tool_context)
    limit = max(1, min(int(page_size) if page_size else 5, 10))
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if target_project:
        headers["X-Goog-User-Project"] = target_project

    payload = json.dumps(
        {
            "query": query,
            "pageSize": limit,
            "contentSearchSpec": {
                "snippetSpec": {"returnSnippet": True},
                "extractiveContentSpec": {"maxExtractiveAnswerCount": 2},
            },
        }
    ).encode("utf-8")

    endpoints = []
    if target_project and DATASTORE_ID:
        endpoints.append(
            f"https://discoveryengine.googleapis.com/v1/projects/{target_project}/locations/global/collections/default_collection/dataStores/{DATASTORE_ID}/servingConfigs/default_search:search"
        )
    if target_project:
        for eng in FALLBACK_ENGINES:
            endpoints.append(
                f"https://discoveryengine.googleapis.com/v1/projects/{target_project}/locations/global/collections/default_collection/engines/{eng}/servingConfigs/default_search:search"
            )

    last_error = ""
    for url in endpoints:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw_results = data.get("results", [])
                parsed_results = []
                for item in raw_results:
                    doc = item.get("document", {})
                    derived = doc.get("derivedStructData", {})
                    struct = doc.get("structData", {})
                    title = (
                        derived.get("title")
                        or struct.get("title")
                        or doc.get("id", "Untitled")
                    )
                    link = derived.get("link") or struct.get("url") or ""
                    snippets = []
                    for s in derived.get("snippets", []):
                        if s.get("snippet"):
                            snippets.append(s["snippet"])
                    for ea in derived.get("extractive_answers", []):
                        if ea.get("content"):
                            snippets.append(ea["content"])
                    parsed_results.append(
                        {
                            "title": title,
                            "link": link,
                            "snippet": " ".join(snippets).strip(),
                        }
                    )
                if parsed_results:
                    return {
                        "status": "success",
                        "query": query,
                        "results_count": len(parsed_results),
                        "results": parsed_results,
                    }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {e.code}: {err_body[:300]}"
        except Exception as e:
            last_error = str(e)

    return {
        "status": "no_internal_site_matches",
        "query": query,
        "results_count": 0,
        "results": [],
        "note": (
            "No matching internal Google Sites documents were returned for this query. "
            "You may answer or generate the requested summary using your comprehensive domain knowledge."
        ),
        "diagnostic": last_error,
    }


async def generate_pdf_summary(
    title: str,
    subtitle: str,
    executive_summary: str,
    sections_markdown: str,
    key_takeaways: str,
    filename: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Generates a formatted 1-2 page binary PDF summary document and saves it as a downloadable artifact.

    Always call this tool whenever the user asks to create, generate, export, or save a PDF document or PDF summary.

    Args:
        title: Main title of the PDF document (e.g., 'Quantum Computing: Executive Summary').
        subtitle: Subtitle or scope description shown in the header banner.
        executive_summary: A concise 1-2 paragraph executive overview of the topic.
        sections_markdown: Detailed body content structured with '## Section Title' headings and '- ' bullet points or paragraphs (aim for 4-6 well-structured sections to fill 1-2 pages).
        key_takeaways: Bullet points ('- ') highlighting the most important conclusions or strategic takeaways.
        filename: Desired PDF file name ending in .pdf (e.g., 'Quantum_Computing_Summary.pdf').

    Returns:
        A dictionary confirming the generated PDF filename, byte size, page count, and artifact version.
    """
    clean_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename.strip() or "Summary.pdf")
    if not clean_name.lower().endswith(".pdf"):
        clean_name += ".pdf"

    pdf = _SummaryPDF(doc_title=title, doc_subtitle=subtitle)
    pdf.alias_nb_pages()
    pdf.add_page()

    # Executive Summary Box
    if executive_summary and executive_summary.strip():
        pdf.set_fill_color(241, 243, 244)
        pdf.set_draw_color(26, 115, 232)
        pdf.set_line_width(0.5)
        start_y = pdf.get_y()
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(26, 115, 232)
        pdf.cell(0, 6, "EXECUTIVE SUMMARY", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(32, 33, 36)
        pdf.multi_cell(
            0,
            5,
            _strip_md_inline(executive_summary.strip()),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        end_y = pdf.get_y()
        pdf.line(14.5, start_y, 14.5, end_y)
        pdf.ln(4)

    # Body Sections parsed from sections_markdown
    for raw_line in (sections_markdown or "").splitlines():
        line = raw_line.strip()
        if not line:
            pdf.ln(1.5)
            continue

        if line.startswith("# "):
            line = "## " + line[2:]

        if line.startswith("## "):
            heading = _strip_md_inline(line[3:].strip())
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 11.5)
            pdf.set_text_color(26, 115, 232)
            pdf.cell(0, 6.5, heading, new_x="LMARGIN", new_y="NEXT")
            pdf.set_draw_color(218, 220, 224)
            pdf.set_line_width(0.2)
            pdf.line(16, pdf.get_y(), 199.9, pdf.get_y())
            pdf.ln(2)
        elif line.startswith("### "):
            subheading = _strip_md_inline(line[4:].strip())
            pdf.ln(1)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(60, 64, 67)
            pdf.cell(0, 5.5, subheading, new_x="LMARGIN", new_y="NEXT")
        elif line.startswith(("- ", "* ")):
            bullet_body = _strip_md_inline(line[2:].strip())
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(32, 33, 36)
            pdf.set_x(19)
            pdf.multi_cell(
                0,
                4.8,
                f"-  {bullet_body}",
                new_x="LMARGIN",
                new_y="NEXT",
            )
        else:
            para = _strip_md_inline(line)
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(32, 33, 36)
            pdf.multi_cell(0, 4.8, para, new_x="LMARGIN", new_y="NEXT")

    # Key Takeaways Section
    if key_takeaways and key_takeaways.strip():
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 11.5)
        pdf.set_text_color(26, 115, 232)
        pdf.cell(0, 6.5, "Key Takeaways", new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(218, 220, 224)
        pdf.line(16, pdf.get_y(), 199.9, pdf.get_y())
        pdf.ln(2)
        for raw_line in key_takeaways.splitlines():
            t_line = raw_line.strip()
            if not t_line:
                continue
            if t_line.startswith(("- ", "* ")):
                t_line = t_line[2:].strip()
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(32, 33, 36)
            pdf.set_x(19)
            pdf.multi_cell(
                0,
                4.8,
                f"-  {_strip_md_inline(t_line)}",
                new_x="LMARGIN",
                new_y="NEXT",
            )

    pdf_bytes = bytes(pdf.output())
    page_count = pdf.page
    sha256_hex = hashlib.sha256(pdf_bytes).hexdigest()

    pdf_part = types.Part(
        inline_data=types.Blob(
            mime_type="application/pdf",
            data=pdf_bytes,
            display_name=clean_name,
        )
    )
    version = await tool_context.save_artifact(
        filename=clean_name,
        artifact=pdf_part,
    )

    return {
        "status": "success",
        "filename": clean_name,
        "mime_type": "application/pdf",
        "page_count": page_count,
        "byte_size": len(pdf_bytes),
        "sha256": sha256_hex,
        "artifact_version": version,
        "message": (
            f"Successfully generated {page_count}-page PDF '{clean_name}' "
            f"({len(pdf_bytes)} bytes) and attached it to the session."
        ),
    }
