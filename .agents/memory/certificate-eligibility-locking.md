---
name: Certificate eligibility locking
description: Concurrency rule for course completion changes and certificate issuance.
---

Certificate issuance and participant module-completion changes must lock the same accepted application row in their transactions. Keep the eligibility read and certificate insert in that locked transaction.

**Why:** Certificate eligibility must not be computed from progress that changes before issuance commits, and a certificate is unique per application.

**How to apply:** Any new route that changes completion state must acquire the application-row lock used by certificate issuance. Keep eligibility evaluation and insertion under that lock.
