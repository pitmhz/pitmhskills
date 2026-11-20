# Measured metrics

Generated from `docs/audit/findings.json`. Do not edit by hand.

## eval

| Metric | Value | Baseline |
| --- | --- | --- |
| tune | 97.8% n=90 (baseline 96.7) | 96.7 |
| heldout | 97.2% n=36 (baseline 97.2) | 97.2 |
| verbose | 92.9% n=14 (baseline 71.4) | 71.4 |
| paraphrase | 100% n=25 (baseline 0) | 0 |
| adversarial | 100% n=8 (baseline 0) | 0 |
| coverage | 100% n=70 (baseline 100) | 100 |
| parsers | 9 pass n=9 (baseline 9) | 9 |

## library

| Metric | Value | Baseline |
| --- | --- | --- |
| cards | 2176 cards | - |
| tier_a | 70 cards (baseline 20) | 20 |
| tier_b | 2103 cards (baseline 2153) | 2153 |
| tier_c | 3 cards (baseline 3) | 3 |
| curated | 506 cards | - |
| empty_disambiguator | 1894 cards | - |
| empty_goal | 2035 cards | - |
| largest_domain_share | 24.7% (baseline 39) | 39 |

## latency

| Metric | Value | Baseline |
| --- | --- | --- |
| p50 | 204.8 ms | - |
| p95 | 240.8 ms | - |
| max | 397 ms | - |

## delivery

| Metric | Value | Baseline |
| --- | --- | --- |
| cap | 3000 bytes | - |
| body_p50 | 2575 bytes | - |
| body_p95 | 2991 bytes | - |
| usable_as_is | 0 of 15 | - |
| needs_ref | 4 of 15 | - |
| unusable | 11 of 15 | - |
| correct_card_usable_as_is | 0 of 12 | - |
| correct_card_needs_ref | 11 of 12 | - |
| clipped_cases | 11 of 12 | - |
| more_relevant_section_dropped | 10 of 11 | - |
| high_confidence_but_unusable | 5 of 5 | - |

## analytics

| Metric | Value | Baseline |
| --- | --- | --- |
| offers_window | 1274 offers | - |
| pick | 619 offers | - |
| ask | 300 offers | - |
| abstain | 355 offers | - |
| usage_rows | 12 rows | - |
| acceptance_window | 1.9% | - |
| acceptance_live_slice | 100% n=12 | - |

## bench

| Metric | Value | Baseline |
| --- | --- | --- |
| n | 80 cases | - |
| top1 | 1.3% n=80 (baseline 97.8) | 97.8 |
| top1_on_routed | 1.4% n=70 | - |
| picked | 1 cases | - |
| asked | 25 cases | - |
| abstained | 54 cases | - |
| false_abstain | 69 cases n=70 | - |
| false_pick | 0 cases n=10 | - |
| wrong_pick | 0 cases n=70 | - |
| none_precision | 90% n=10 | - |
| expected_card_first | 51.4% n=70 | - |
| expected_card_in_top3 | 58.6% n=70 | - |
| correct_first_but_not_picked | 35 cases n=69 | - |
| correct_first_but_below_floor | 16 cases | - |
| correct_first_but_between_floor_and_pick_floor | 19 cases | - |
| never_in_shortlist | 29 cases n=70 | - |
| determinism_mismatches | 0 cases n=80 | - |
| determinism_reverse_mismatches | 0 cases n=80 | - |
| latency_p50 | 199.1 ms | - |
| latency_p95 | 235.5 ms | - |
| body_at_cap | 0 cases n=26 | - |

## length_buckets

| Metric | Value | Baseline |
| --- | --- | --- |
| bucket_60_79 | 67.6% n=37 | - |
| bucket_80_99 | 42.1% n=19 | - |
| bucket_100_119 | 20% n=5 | - |
| bucket_120_plus | 22.2% n=9 | - |
| abstain_60_79 | 48.6% n=37 | - |
| abstain_120_plus | 88.9% n=9 | - |

## audit

| Metric | Value | Baseline |
| --- | --- | --- |
| src_modules | 64 files | - |
| reachable_modules | 51 files | - |
| script_entry_modules | 12 files | - |
| test_only_modules | 1 files | - |
| dead_modules | 1 files | - |
| dead_exported_symbols | 36 symbols | - |
| card_fields_never_read | 7 fields | - |
| card_fields_dropped_at_db | 2 fields | - |
| config_keys_never_read | 4 keys | - |
| config_keys_hardcoded_elsewhere | 3 keys | - |
| bugs_found | 12 bugs | - |
| bugs_p1 | 4 bugs | - |
| bugs_p2 | 7 bugs | - |
| bugs_p3 | 1 bugs | - |
| integration_test_pass | 8 pass n=8 | - |
| integration_test_assertions | 61 assertions | - |
| project_unit_tests | 93 pass n=95 | - |
| vendored_suite_failures | 331 fail | - |

## review

| Metric | Value | Baseline |
| --- | --- | --- |
| threshold_ceiling_routed | 28.6% n=70 | - |
| threshold_ceiling_correct | 20 cases n=70 | - |
| plus_floor_drop | 51.4% n=70 | - |
| plus_rank_promotion | 58.6% n=70 | - |
| relaxed_rule_correct | 19 cases n=70 | - |
| relaxed_rule_wrong | 4 cases n=70 | - |
| relaxed_rule_wrong_on_none | 0 cases n=10 | - |
| decision_accuracy_now | 12.5% n=80 | - |
| decision_accuracy_relaxed | 35% n=80 | - |
| label_suspects | 11 cases n=70 | - |
| label_suspect_share | 15.7% n=70 | - |
| tier_a_self_route_short | 100% n=70 | - |
| tier_a_self_route_padded | 70% n=70 | - |
| padded_fail_right_card_rank1 | 13 cases n=21 | - |
| padded_fail_right_card_missing | 8 cases n=21 | - |
| right_first_above_pickfloor | 1 cases n=36 | - |
| right_first_between_floor_pickfloor | 19 cases n=36 | - |
| right_first_below_floor | 16 cases n=36 | - |

## phase1

| Metric | Value | Baseline |
| --- | --- | --- |
| bench_top1_before | 1 of 80 (baseline 1) | 1 |
| bench_top1_after | 18 of 80 (baseline 1) | 1 |
| bench_picked_before | 1 of 80 | - |
| bench_picked_after | 19 of 80 | - |
| bench_asked_after | 7 of 80 (baseline 25) | 25 |
| bench_wrong_pick | 1 of 70 (baseline 0) | 0 |
| bench_false_pick_none | 0 of 10 (baseline 0) | 0 |
| surfaced_rate | 83% n=210 | - |
| margin_10_right | 19 cases n=70 | - |
| margin_10_wrong | 4 cases n=70 | - |
| margin_15_right | 18 cases n=70 | - |
| margin_15_wrong | 1 cases n=70 | - |
| margin_18_right | 15 cases n=70 | - |
| pool_80_cluster_32_right | 126 cases n=210 (baseline 122) | 122 |
| pool_120_wrong | 5 cases n=210 (baseline 1) | 1 |
| query_terms_25_surfaced | 179 cases n=210 (baseline 174) | 174 |
| query_terms_40_wrong | 6 cases n=210 (baseline 1) | 1 |
| generic_terms_in_corpus | 12 of 7036 | - |
| generic_cut_df | 391 cards | - |

## trim_trade

| Metric | Value | Baseline |
| --- | --- | --- |
| known_long_hit | 33 of 80 | - |
| known_long_pick | 22 of 80 | - |
| known_long_wrong | 1 of 80 | - |
| known_verbose | 85.7% n=14 | - |
| rare_long_hit | 30 of 80 | - |
| rare_long_pick | 19 of 80 | - |
| rare_long_wrong | 1 of 80 | - |
| rare_verbose | 92.9% n=14 | - |
| short_sets_identical | 1 of 5 sets identical | - |

## phase2_final

| Metric | Value | Baseline |
| --- | --- | --- |
| bench_top1 | 21 of 80 (baseline 1) | 1 |
| bench_pick | 22 of 80 (baseline 1) | 1 |
| bench_ask | 9 of 80 (baseline 25) | 25 |
| bench_wrong_pick | 1 of 70 (baseline 0) | 0 |
| bench_false_pick_none | 0 of 10 (baseline 0) | 0 |
| eval_tune | 97.8% n=90 | - |
| eval_heldout | 97.2% n=36 | - |
| eval_verbose | 85.7% n=14 | - |
| eval_paraphrase | 100% n=25 | - |
| eval_adversarial | 100% n=8 | - |
| eval_coverage | 100% n=70 | - |
| latency_p50 | 248 ms | - |
| latency_p95 | 297 ms | - |
| pool_80_same_outcome | 1 of 3 pool settings identical | - |
| pool_80_extra_latency | 37 ms at p50 | - |
| scoped_tests | 95 pass n=95 | - |
