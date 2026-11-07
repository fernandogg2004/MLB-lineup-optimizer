import numpy as np

from batting_order.evaluate.run import rank_distribution


def test_rank_distribution_counts_every_game_and_keeps_its_summary() -> None:
    pct = np.array([0.0, 0.42, 0.91, 0.96, 0.995, 1.0])
    d = rank_distribution(pct)
    assert sum(d["hist_counts"]) == pct.size
    assert d["n_team_games"] == pct.size
    assert len(d["hist_edges"]) == len(d["hist_counts"]) + 1
    assert d["median"] == float(np.median(pct))
    assert d["share_above"]["0.90"] == 4 / 6
    assert d["share_above"]["0.99"] == 2 / 6
    assert d["hist_counts"][-1] == 3  # 0.96, 0.995 and exactly 1 share the top bin
