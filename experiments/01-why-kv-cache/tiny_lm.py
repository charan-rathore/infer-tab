"""Tiny one-layer causal LM used only to make K/V reuse visible.

This is not a useful language model. Weights are random. Generated text
will look like nonsense. Watch the Key/Value work, not the sentence.
"""

from __future__ import annotations

import math
import re
from typing import List, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

# Extra words so greedy decoding has somewhere to go besides the prompt.
# The experiment is about memory, not vocabulary quality.
AUX_WORDS = ("the", "a", "and", "of", "to", "is", "on", "it", "in", "for")


def tokenize(text: str) -> List[str]:
    """Split on words and leftover punctuation so a typed sentence stays readable."""
    text = text.strip()
    if not text:
        return ["the"]
    return re.findall(r"\w+|[^\w\s]", text)


def build_vocab(prompt_tokens: List[str]) -> Tuple[List[str], dict]:
    """Deterministic vocab: specials, then sorted unique words."""
    specials = ["<pad>", "<unk>"]
    words = sorted(set(prompt_tokens) | set(AUX_WORDS))
    itos = specials + [w for w in words if w not in specials]
    stoi = {tok: i for i, tok in enumerate(itos)}
    return itos, stoi


def encode(tokens: List[str], stoi: dict) -> List[int]:
    unk = stoi["<unk>"]
    return [stoi.get(tok, unk) for tok in tokens]


class TinyCausalLM(nn.Module):
    """One attention layer. Every projection is visible in decode.py.

    Shapes (after embedding a sequence of T tokens):
      x: [T, D]
      Q, K, V: [T, D]   — later split into H heads of size D/H
    """

    def __init__(self, vocab_size: int, d_model: int = 16, n_heads: int = 2, max_pos: int = 128):
        super().__init__()
        if d_model % n_heads != 0:
            raise ValueError("d_model must be divisible by n_heads")
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_head = d_model // n_heads
        self.vocab_size = vocab_size

        self.tok_emb = nn.Embedding(vocab_size, d_model)
        # WHY positions exist: attention itself has no sense of order.
        # Without a position signal, "cat sat" and "sat cat" look the same.
        self.pos_emb = nn.Embedding(max_pos, d_model)

        # WHY three projections: Q asks "what am I looking for?",
        # K answers "what do I contain?", V is "what do I contribute?".
        # A past position's K/V may depend on its token, its position, and
        # all causally preceding context at this layer. In this one-layer
        # toy that context is token + position embeddings. Caching is legal
        # because a later token cannot rewrite an already-computed past
        # hidden state in a causal Transformer — including after we add
        # more layers later.
        self.W_q = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_model, bias=False)
        self.W_v = nn.Linear(d_model, d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)
        self.lm_head = nn.Linear(d_model, vocab_size, bias=False)

    def embed(self, token_ids: torch.Tensor, start_pos: int = 0) -> torch.Tensor:
        """token_ids: [T] → hidden states [T, D]."""
        t = token_ids.shape[0]
        positions = torch.arange(start_pos, start_pos + t, device=token_ids.device)
        return self.tok_emb(token_ids) + self.pos_emb(positions)

    def project_qkv(self, hidden: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        return self.W_q(hidden), self.W_k(hidden), self.W_v(hidden)

    def attend(
        self,
        q: torch.Tensor,
        k: torch.Tensor,
        v: torch.Tensor,
        q_positions: torch.Tensor,
        k_positions: torch.Tensor,
    ) -> torch.Tensor:
        """Scaled dot-product attention with a causal mask.

        WHY the mask: next-token prediction would be trivial if a token
        could read the future, including the answer it is supposed to guess.

        WHY 1/sqrt(d_head): raw dot products grow with dimension and
        would push softmax into a one-hot spike.
        """
        h, d_head = self.n_heads, self.d_head
        t_q, t_k = q.shape[0], k.shape[0]

        qh = q.view(t_q, h, d_head).transpose(0, 1)  # [H, Tq, d]
        kh = k.view(t_k, h, d_head).transpose(0, 1)
        vh = v.view(t_k, h, d_head).transpose(0, 1)

        scores = torch.matmul(qh, kh.transpose(-2, -1)) / math.sqrt(d_head)
        # mask[i, j] = True means "query i must not see key j"
        future = k_positions.unsqueeze(0) > q_positions.unsqueeze(1)  # [Tq, Tk]
        scores = scores.masked_fill(future, float("-inf"))
        weights = F.softmax(scores, dim=-1)
        ctx = torch.matmul(weights, vh)  # [H, Tq, d]
        mixed = ctx.transpose(0, 1).contiguous().view(t_q, h * d_head)
        return self.W_o(mixed)

    def attention_scores(
        self,
        q: torch.Tensor,
        k: torch.Tensor,
        q_positions: torch.Tensor,
        k_positions: torch.Tensor,
    ) -> torch.Tensor:
        """Causal attention scores, shape [H, Tq, Tk].

        WHY we expose this: prefill is many queries vs many keys ([P, P] per
        head). Decode is one new query vs the whole history ([1, T] per head).
        The shapes are the lesson; we do not treat them as FLOP/s.
        """
        h, d_head = self.n_heads, self.d_head
        t_q, t_k = q.shape[0], k.shape[0]
        qh = q.view(t_q, h, d_head).transpose(0, 1)
        kh = k.view(t_k, h, d_head).transpose(0, 1)
        scores = torch.matmul(qh, kh.transpose(-2, -1)) / math.sqrt(d_head)
        future = k_positions.unsqueeze(0) > q_positions.unsqueeze(1)
        return scores.masked_fill(future, float("-inf"))

    def logits_from_hidden(self, hidden_last: torch.Tensor) -> torch.Tensor:
        return self.lm_head(hidden_last)


def seed_model(vocab_size: int, seed: int, d_model: int = 16, n_heads: int = 2) -> TinyCausalLM:
    torch.manual_seed(seed)
    model = TinyCausalLM(vocab_size, d_model=d_model, n_heads=n_heads)
    model.eval()
    return model
