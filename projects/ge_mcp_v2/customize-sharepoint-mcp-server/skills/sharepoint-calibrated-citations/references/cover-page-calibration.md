# PDF `+1` Cover Page Calibration & Output Template

1. Count every physical page in the PDF starting at `1` for the cover page (`[Page 1]` in `query_file_content_lookup`).
2. When printed footer numbering begins on physical page 2 (or search metadata is 0-indexed), add `+1` so `#page=N` lands on the exact physical viewer page.
3. Structure responses with `### Summary & Answer` followed by `### Sources & Citations`.
