"""
Metalearning Concept Map & Taxonomy
ClawCorp Research Lab — Mission M-1771680529149

A structured ASCII concept map of the metalearning landscape.
"""

CONCEPT_MAP = """
╔══════════════════════════════════════════════════════════════════════════╗
║                     METALEARNING CONCEPT MAP                            ║
║                  "What should be meta-learned?"                         ║
╚══════════════════════════════════════════════════════════════════════════╝

                    ┌─────────────────────┐
                    │   TASK DISTRIBUTION  │
                    │  P(τ) — the source  │
                    │  of meta-knowledge  │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
 ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
 │ WHAT TO      │    │  HOW TO ADAPT    │    │  HOW TO EVALUATE  │
 │ SHARE        │    │  (inner loop)    │    │  (meta-objective) │
 └──────┬───────┘    └────────┬─────────┘    └────────┬──────────┘
        │                     │                        │
  ┌─────┴──────┐        ┌─────┴─────┐          ┌──────┴──────┐
  │ Weights    │        │ Gradient  │          │ Query loss  │
  │ (init θ)  │        │ descent   │          │ after adapt │
  │ Features  │        │ Attention │          │ Episode     │
  │ (embed.)  │        │ Memory    │          │ accuracy    │
  │ Optimizer  │        │ write     │          └─────────────┘
  │ Loss fn   │        └───────────┘
  │ Arch.     │
  └───────────┘

═══════════════════════════════════════════════════════════════════════════
PARADIGM TREE
═══════════════════════════════════════════════════════════════════════════

METALEARNING
├── OPTIMIZATION-BASED (meta-learn initialization or optimizer)
│   ├── MAML ──── inner: K steps GD ──── outer: GD through inner
│   │   └── variants: iMAML, CAVIA, ANIL, LEO, Meta-SGD
│   ├── Reptile ─ first-order, move θ toward adapted θ_τ
│   └── L2O ──── LSTM as learned optimizer (replaces SGD)
│
├── METRIC-BASED (meta-learn embedding space)
│   ├── Prototypical Networks ─── nearest prototype (Euclidean)
│   ├── Matching Networks ──────── soft-NN with cosine attention
│   ├── Relation Networks ──────── learned comparison function
│   └── FEAT ───────────────────── task-conditioned embeddings
│
├── MODEL-BASED (architecture encodes fast learning)
│   ├── MANN/NTM ─── external differentiable memory
│   ├── SNAIL ──────── temporal conv + attention
│   └── Transformers ─ in-context learning IS metalearning
│       └── Theory: attn ≈ 1 step gradient descent (Von Oswald '23)
│
└── HYPERPARAMETER/ARCHITECTURE SEARCH
    ├── NAS ───── architecture as meta-parameter
    ├── AutoML-Zero ─ evolve full learning algorithm
    └── Data Curriculum ─ task ordering as meta-parameter

═══════════════════════════════════════════════════════════════════════════
THE META-LEARNING LOOP
═══════════════════════════════════════════════════════════════════════════

  META-TRAIN LOOP (slow, across many tasks)
  ┌─────────────────────────────────────────────────────┐
  │                                                       │
  │  Sample task τ ~ P(τ)                                │
  │         │                                             │
  │         ▼                                             │
  │  [INNER LOOP] Adapt with D_support^τ                 │
  │  θ_τ = θ - α ∇_θ L(θ; D_support^τ)                  │
  │         │                                             │
  │         ▼                                             │
  │  [OUTER LOOP] Evaluate on D_query^τ                  │
  │  meta_loss += L(θ_τ; D_query^τ)                      │
  │         │                                             │
  │         ▼                                             │
  │  θ ← θ - β ∇_θ meta_loss     ← meta-gradient        │
  │                                                       │
  └─────────────────────────────────────────────────────┘

  META-TEST (fast, on new task τ_new)
  ┌─────────────────────────────┐
  │  K shots from D_support     │
  │  → adapt θ to θ_τ_new       │
  │  → predict on D_query       │
  └─────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════
KEY TENSIONS / DESIGN TRADEOFFS
═══════════════════════════════════════════════════════════════════════════

  Fast adaptation ←────────────────────→ Stability / forgetting
  (few gradient steps)                   (don't destroy prior knowledge)

  Narrow task distribution ←──────────→ Broad generalization
  (easy to meta-learn)                   (hard to meta-learn)

  Implicit memory (weights) ←─────────→ Explicit memory (external)
  (slow to write)                        (fast to write, hard to index)

  Optimization-based ←────────────────→ Metric-based
  (flexible, expensive)                  (fast inference, less flexible)

  Labeled episodes ←──────────────────→ Self-supervised tasks
  (expensive data)                       (unlimited data)

═══════════════════════════════════════════════════════════════════════════
NEUROSCIENCE ANALOGS
═══════════════════════════════════════════════════════════════════════════

  Biological System         │  Metalearning Analog
  ─────────────────────────────────────────────────────────
  Hippocampus (fast write)  │  External memory / NTM
  Neocortex (slow, stat.)   │  Meta-learned weight init
  Neuromodulators (DA, ACh) │  Learned per-param learning rates
  Prefrontal Cortex (WM)    │  Context window / fast weights
  Synaptic consolidation    │  Meta-regularization / EWC
  Predictive coding         │  Meta-learned generative prior
  Developmental curriculum  │  Task curriculum metalearning

═══════════════════════════════════════════════════════════════════════════
RESEARCH FRONTIER (2025-2026)
═══════════════════════════════════════════════════════════════════════════

  [HOT] Metalearning for LLM personalization (LoRA + MAML)
  [HOT] In-context learning theory (when does it work?)
  [HOT] Meta-RL for agent self-improvement
  [NEW] Compositional task programs (DreamCoder meets metalearning)
  [NEW] Neuromorphic fast plasticity rules
  [NEW] Meta-learning for scientific hypothesis generation
  [OPEN] OOD task generalization (the core unsolved problem)
  [OPEN] Catastrophic forgetting in continual metalearning
"""

if __name__ == "__main__":
    print(CONCEPT_MAP)

    # Export as plain text artifact
    with open("metalearning_concept_map.txt", "w") as f:
        f.write(CONCEPT_MAP)
    print("\nConcept map saved to metalearning_concept_map.txt")
