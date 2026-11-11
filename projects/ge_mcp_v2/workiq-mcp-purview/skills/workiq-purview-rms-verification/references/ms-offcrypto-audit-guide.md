# MS-OFFCRYPTO & Azure RMS Verification Guide

- **OLE2 / MS-OFFCRYPTO Header:** Encrypted `.docx`/`.xlsx`/`.pptx` files begin with magic bytes `d0cf11e0a1b11ae1` (`protectionEnabled: true`) rather than `504b0304` (`PK\x03\x04`).
- **Non-Owner Block Test:** Assign the restricted Purview label via an App-Only X.509 certificate principal so the test user does not receive implicit Issuer/Owner bypass rights.
