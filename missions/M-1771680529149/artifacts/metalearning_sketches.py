"""
Metalearning Algorithm Sketches
ClawCorp Research Lab — Mission M-1771680529149

Minimal, readable implementations of core metalearning ideas.
Not production code — designed to make the algorithms transparent.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from typing import Callable, List, Tuple
import copy


# ============================================================
# 1. MAML — Model-Agnostic Meta-Learning (Finn et al., 2017)
# ============================================================

class MAMLLearner:
    """
    MAML: Find an initial parameter θ that can be adapted to any task
    in K gradient steps. Meta-objective: minimize loss after K steps.

    Inner loop: task-specific gradient descent.
    Outer loop: meta-gradient through the inner loop.
    """
    def __init__(self, model: nn.Module, inner_lr: float = 0.01, inner_steps: int = 5):
        self.model = model
        self.inner_lr = inner_lr
        self.inner_steps = inner_steps
        self.meta_optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    def inner_adapt(self, model: nn.Module, support_x: Tensor, support_y: Tensor) -> nn.Module:
        """Fast adaptation: K steps of gradient descent on a task's support set."""
        adapted = copy.deepcopy(model)
        optimizer = torch.optim.SGD(adapted.parameters(), lr=self.inner_lr)
        for _ in range(self.inner_steps):
            loss = F.cross_entropy(adapted(support_x), support_y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        return adapted

    def meta_train_step(self, tasks: List[Tuple[Tensor, Tensor, Tensor, Tensor]]) -> float:
        """
        One meta-training step over a batch of tasks.
        Each task: (support_x, support_y, query_x, query_y)
        """
        meta_loss = 0.0
        for (sx, sy, qx, qy) in tasks:
            # Inner loop: adapt to support set
            adapted_model = self.inner_adapt(self.model, sx, sy)
            # Outer loop: evaluate on query set
            query_loss = F.cross_entropy(adapted_model(qx), qy)
            meta_loss += query_loss

        meta_loss = meta_loss / len(tasks)
        self.meta_optimizer.zero_grad()
        meta_loss.backward()
        self.meta_optimizer.step()
        return meta_loss.item()


# ============================================================
# 2. Prototypical Networks (Snell et al., 2017)
# ============================================================

class ProtoNet(nn.Module):
    """
    Learn an embedding space where class prototypes (mean embeddings)
    are the best representatives. Classify by nearest prototype.

    Key insight: Euclidean distance in a learned embedding space is
    sufficient for few-shot classification.
    """
    def __init__(self, encoder: nn.Module):
        super().__init__()
        self.encoder = encoder

    def forward(self, support_x: Tensor, support_y: Tensor, query_x: Tensor) -> Tensor:
        """
        support_x: [N_ways * K_shots, C, H, W]
        support_y: [N_ways * K_shots]
        query_x:   [N_query, C, H, W]
        Returns:   log_softmax scores [N_query, N_ways]
        """
        # Encode all examples
        support_z = self.encoder(support_x)  # [N*K, D]
        query_z   = self.encoder(query_x)    # [Q, D]

        # Compute class prototypes (mean of support embeddings per class)
        classes = support_y.unique()
        prototypes = torch.stack([
            support_z[support_y == c].mean(0) for c in classes
        ])  # [N_ways, D]

        # Negative squared Euclidean distance as logit
        dists = torch.cdist(query_z, prototypes)  # [Q, N_ways]
        return F.log_softmax(-dists, dim=1)


# ============================================================
# 3. Matching Networks (Vinyals et al., 2016)
# ============================================================

class MatchingNet(nn.Module):
    """
    Soft nearest-neighbor in embedding space with attention.
    The key innovation: embeddings are *contextualized* by the full support set.

    attention(query, support) = softmax(cosine_sim) -> weighted sum of labels
    """
    def __init__(self, encoder: nn.Module):
        super().__init__()
        self.encoder = encoder

    def cosine_attention(self, query_z: Tensor, support_z: Tensor) -> Tensor:
        """Compute attention weights via cosine similarity."""
        q_norm = F.normalize(query_z, dim=-1)  # [Q, D]
        s_norm = F.normalize(support_z, dim=-1)  # [N, D]
        sim = q_norm @ s_norm.T  # [Q, N]
        return F.softmax(sim, dim=-1)

    def forward(self, support_x, support_y_onehot, query_x):
        """Returns soft label predictions for each query."""
        support_z = self.encoder(support_x)
        query_z   = self.encoder(query_x)
        attn = self.cosine_attention(query_z, support_z)  # [Q, N]
        return attn @ support_y_onehot  # [Q, N_ways]


# ============================================================
# 4. Reptile (Nichol et al., 2018) — First-order MAML
# ============================================================

def reptile_update(model: nn.Module, tasks, inner_lr=0.01, inner_steps=5, meta_step=0.1):
    """
    Reptile: Simpler than MAML. No second-order gradients.
    Move meta-parameters toward the task-adapted parameters.

    Update: θ <- θ + meta_step * mean_τ(θ_τ - θ)
    """
    meta_update = {n: torch.zeros_like(p) for n, p in model.named_parameters()}

    for (sx, sy, _, _) in tasks:
        # Adapt to task
        adapted = copy.deepcopy(model)
        opt = torch.optim.SGD(adapted.parameters(), lr=inner_lr)
        for _ in range(inner_steps):
            F.cross_entropy(adapted(sx), sy).backward()
            opt.step(); opt.zero_grad()

        # Accumulate: θ_τ - θ
        for n, p in model.named_parameters():
            meta_update[n] += adapted.state_dict()[n] - p.data

    # Apply meta-update (move toward task-adapted params)
    with torch.no_grad():
        for n, p in model.named_parameters():
            p.data += meta_step * meta_update[n] / len(tasks)


# ============================================================
# 5. Memory-Augmented Neural Network (MANN / NTM-style)
# ============================================================

class ExternalMemory(nn.Module):
    """
    Simple differentiable key-value memory.
    Inspired by Neural Turing Machine / MANN (Santoro et al., 2016).

    Write: update memory slots with new (key, value) pairs.
    Read:  retrieve values via softmax attention on cosine similarity.
    """
    def __init__(self, memory_size: int, key_dim: int, value_dim: int):
        super().__init__()
        self.keys   = nn.Parameter(torch.randn(memory_size, key_dim))
        self.values = nn.Parameter(torch.randn(memory_size, value_dim))

    def read(self, query: Tensor) -> Tensor:
        """Soft lookup: weighted sum of values by cosine similarity to keys."""
        sim = F.cosine_similarity(query.unsqueeze(1), self.keys.unsqueeze(0), dim=-1)
        weights = F.softmax(sim, dim=-1)  # [B, M]
        return weights @ self.values       # [B, value_dim]

    def write(self, key: Tensor, value: Tensor, lr: float = 0.1):
        """Hebbian-style write: move nearest key/value toward new pair."""
        with torch.no_grad():
            sim = F.cosine_similarity(key.unsqueeze(1), self.keys.unsqueeze(0), dim=-1)
            idx = sim.argmax(dim=-1)
            self.keys[idx]   += lr * (key   - self.keys[idx])
            self.values[idx] += lr * (value - self.values[idx])


# ============================================================
# 6. Learning to Optimize (L2O sketch)
# ============================================================

class LearnedOptimizer(nn.Module):
    """
    An LSTM that learns to output gradient updates.
    (Andrychowicz et al., 2016)

    Input: current gradient (and optionally loss, step).
    Output: parameter update (replaces SGD/Adam step).
    """
    def __init__(self, hidden_size: int = 20):
        super().__init__()
        self.lstm = nn.LSTMCell(input_size=1, hidden_size=hidden_size)
        self.output = nn.Linear(hidden_size, 1)
        self.hidden_size = hidden_size

    def forward(self, grad: Tensor, hidden: Tuple[Tensor, Tensor]) -> Tuple[Tensor, Tuple]:
        """
        grad: [n_params, 1] — current gradient (preprocessed per-param)
        Returns: parameter update and new hidden state.
        """
        h, c = self.lstm(grad, hidden)
        update = self.output(h)
        return update, (h, c)

    def init_hidden(self, n_params: int) -> Tuple[Tensor, Tensor]:
        return (torch.zeros(n_params, self.hidden_size),
                torch.zeros(n_params, self.hidden_size))


# ============================================================
# 7. In-Context Learning as Implicit Metalearning
# ============================================================

def in_context_metalearning_demo():
    """
    Conceptual demonstration: how a Transformer forward pass
    implements gradient descent in its attention layers.

    Von Oswald et al. (2023) show that self-attention with linear
    attention approximation implements one step of gradient descent
    on a linear regression loss over the context examples.

    W_QK encodes the "learning rate * feature transform"
    The context (x_i, y_i) pairs are the training data
    The query x is the test input

    Simplified linear case:
        W_new = W_old - alpha * sum_i (W_old x_i - y_i) x_i^T
        y_pred = W_new * x_query
    """
    torch.manual_seed(42)
    D = 8  # feature dim

    # Simulated context: 5 (input, label) pairs
    context_x = torch.randn(5, D)
    context_y = torch.randn(5, 1)
    query_x   = torch.randn(1, D)

    # "Pre-trained" weight matrix W (meta-learned parameter)
    W = torch.randn(1, D) * 0.1
    alpha = 0.1

    # In-context gradient descent (1 step of linear regression):
    preds = context_x @ W.T        # [5, 1]
    errors = preds - context_y     # [5, 1]
    grad_W = (errors.T @ context_x) / 5  # [1, D]
    W_adapted = W - alpha * grad_W

    # Predict on query
    y_before = query_x @ W.T
    y_after  = query_x @ W_adapted.T

    print(f"Query prediction BEFORE in-context adaptation: {y_before.item():.4f}")
    print(f"Query prediction AFTER  in-context adaptation: {y_after.item():.4f}")
    print("This is exactly what a linear Transformer attention layer computes!")
    return W_adapted


# ============================================================
# 8. Fast Weights (Ba et al., 2016 / Hopfield connection)
# ============================================================

class FastWeightMemory(nn.Module):
    """
    Fast weights: a slow network writes to fast weights;
    fast weights act as associative (Hopfield) memory.

    Modern framing: this is equivalent to linear attention / kernel attention.
    The fast weight matrix A stores episode-level associations.
    """
    def __init__(self, dim: int):
        super().__init__()
        self.slow_net = nn.Linear(dim, dim * 2)  # produces key, value
        self.dim = dim

    def write(self, x: Tensor) -> Tensor:
        """Encode x as key-value pair, update fast weight matrix."""
        kv = self.slow_net(x)
        k, v = kv[:, :self.dim], kv[:, self.dim:]  # [B, D] each
        # Outer product: accumulate association k -> v
        A = torch.bmm(v.unsqueeze(2), k.unsqueeze(1))  # [B, D, D]
        return A  # fast weight matrix

    def read(self, query: Tensor, A: Tensor) -> Tensor:
        """Retrieve from fast weight memory via matrix-vector product."""
        return torch.bmm(A, query.unsqueeze(2)).squeeze(2)  # [B, D]


# ============================================================
# Demo
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Metalearning Algorithm Sketches — ClawCorp Research Lab")
    print("=" * 60)

    print("\n[1] In-Context Learning as Gradient Descent:")
    in_context_metalearning_demo()

    print("\n[2] ProtoNet forward pass:")
    encoder = nn.Sequential(nn.Flatten(), nn.Linear(28*28, 64), nn.ReLU(), nn.Linear(64, 32))
    proto_net = ProtoNet(encoder)
    # 5-way 1-shot: 5 support examples, 10 query examples
    sx = torch.randn(5, 1, 28, 28)
    sy = torch.arange(5)
    qx = torch.randn(10, 1, 28, 28)
    logits = proto_net(sx, sy, qx)
    print(f"  Query logits shape: {logits.shape} (should be [10, 5])")
    print(f"  Predicted classes: {logits.argmax(dim=1).tolist()}")

    print("\n[3] External Memory read/write:")
    mem = ExternalMemory(memory_size=16, key_dim=8, value_dim=4)
    key   = torch.randn(1, 8)
    value = torch.randn(1, 4)
    mem.write(key, value)
    retrieved = mem.read(key)
    print(f"  Retrieved value shape: {retrieved.shape}")
    cos_sim = F.cosine_similarity(retrieved, value)
    print(f"  Cosine similarity (written vs retrieved): {cos_sim.item():.4f}")

    print("\nAll sketches ran successfully.")
    print("See metalearning_brainstorm.md for full conceptual analysis.")
