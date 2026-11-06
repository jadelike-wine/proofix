---
name: Wrong verdict
about: ProofFix said VERIFIED/FAILED when it shouldn't have
labels: wrong-verdict
---

The verdict is the product. If ProofFix claimed a fix works (or failed) when
ground truth says otherwise, this is the highest-priority bug class.

**The claimed fix**: base ref → head ref, what the bug was

**What ProofFix reported**: verdict + evidence + reasons

**Ground truth**: what actually happens when you run the test manually

**Can you share the repo / a minimal reproduction?**
