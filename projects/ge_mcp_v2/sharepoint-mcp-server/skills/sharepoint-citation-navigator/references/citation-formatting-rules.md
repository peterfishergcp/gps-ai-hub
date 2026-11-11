# SharePoint File-Type-Aware Citation Rules

- **PDF Documents (`.pdf`):** Strip `?web=1` and append `#page=N` matching the `[Page N]` marker emitted by `query_file_content_lookup`.
  - Pattern: `[Annual Report (Page 4)](https://<YOUR_TENANT>.sharepoint.com/sites/Finance/Shared%20Documents/Annual_Report.pdf#page=4)`
- **Office Documents (`.docx`, `.xlsx`, `.pptx`):** Keep `?web=1` so the browser opens Word, Excel, or PowerPoint Online rather than forcing a raw binary download, and include `[Slide N]` or `[Sheet: Name]` in the visible link label.
