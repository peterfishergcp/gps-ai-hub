from mcp.server.fastmcp import FastMCP
import re

# Initialize FastMCP Server
mcp = FastMCP("Citation & Deep-Link MCP Server")

@mcp.tool()
def format_document_citation(
    document_title: str, 
    base_web_url: str, 
    page_number: int = None, 
    section_heading: str = None
) -> str:
    """
    Generates an enterprise-compliant citation markdown link with deep page or section anchors.
    
    Args:
        document_title: The human-readable title or file name of the document (e.g. 'Q3_Financials.pdf').
        base_web_url: The SharePoint or web URL to the document.
        page_number: Optional physical viewer page index (1-indexed).
        section_heading: Optional section or heading name in a Word/HTML document.
        
    Returns:
        Formatted markdown citation string with deep anchor link (e.g., [Q3_Financials.pdf](https://.../Q3_Financials.pdf#page=5)).
    """
    clean_url = base_web_url.split('#')[0]  # Remove existing anchors if any
    
    # 1. Handle physical PDF page anchors
    if page_number is not None and page_number > 0:
        deep_link = f"{clean_url}#page={page_number}"
        return f"[{document_title}]({deep_link})"
    
    # 2. Handle Word/HTML section heading anchors
    if section_heading:
        # Sanitize section name for URL anchor encoding
        sanitized_heading = re.sub(r'[^\w\s-]', '', section_heading).strip().replace(' ', '_')
        deep_link = f"{clean_url}#section={sanitized_heading}"
        return f"[{document_title}]({deep_link})"
    
    # 3. Fallback to base document link
    return f"[{document_title}]({clean_url})"


@mcp.tool()
def extract_citations_from_text(text: str, document_web_url: str) -> dict:
    """
    Scans document text for page/section markers and constructs deep citation links.
    
    Args:
        text: Extracted text content from a document containing page or section markers.
        document_web_url: Base web URL of the document.
        
    Returns:
        Dictionary containing extracted citation snippets and deep links.
    """
    citations = []
    
    # Regex to detect page references (e.g., "Page 5:", "page 12:")
    page_matches = re.finditer(r'(?:Page|page)\s+(\d+)[:\s]+(.*)', text)
    for match in page_matches:
        page_num = int(match.group(1))
        snippet = match.group(2)[:100].strip()
        citations.append({
            "type": "page_anchor",
            "page": page_num,
            "snippet": snippet,
            "citation_markdown": f"[Page {page_num}]({document_web_url}#page={page_num})"
        })
        
    return {
        "document_url": document_web_url,
        "total_citations_found": len(citations),
        "citations": citations
    }


if __name__ == "__main__":
    # Start the FastMCP server
    mcp.run()
