# UTXO State Machine (Text Description)

States:
- INIT: covenant UTXO is deployed with a seed value and campaign parameters (goal, expiry, beneficiary).
- ACCUMULATION: covenant UTXO is repeatedly spent and recreated by PLEDGE transactions, monotonically increasing value.
- SUCCESS: covenant value has met/exceeded goal; covenant can be finalized to beneficiary.
- EXPIRED: time has passed expiration without meeting goal; covenant can be drained via REFUND.

Transitions:
- INIT -> ACCUMULATION: first pledge transaction recreates the covenant with the same script and higher value.
- ACCUMULATION -> ACCUMULATION: additional pledges keep the same script hash/campaign id and increase value.
- ACCUMULATION -> SUCCESS: finalize transaction when value >= goal; covenant output disappears and beneficiary output is paid.
- ACCUMULATION -> EXPIRED: when locktime >= expiration and goal is still unmet.
- EXPIRED -> EXPIRED: refund transactions progressively reduce covenant value; optionally recreate a smaller covenant output.
- SUCCESS or fully drained EXPIRED are terminal.

ASCII sketch:
```
[INIT] --pledge--> [ACCUMULATION] --pledge--> [ACCUMULATION]
      \\                             ||\n       \\__timeout (no goal)___     ||\n                     \\             ||\n                      v            ||\n                   [EXPIRED] --refund--> [EXPIRED/drained]\n                      ^\n                      | (goal reached)\n[ACCUMULATION] --finalize--> [SUCCESS -> beneficiary paid]\n```
