# Phase 1 Spec (v2) — Fixed-Bid billing

*v2 incorporates kino's review: canonical contract amount, DB consistency constraints, all creation paths, template-selection API, type-change rule, a minimal fixed-fee invoice affordance, and naming.*

**Context:** hillco2 billing is currently 100% time-and-materials (engagements carry `default_hourly_rate`; invoices built from `time_entries` hours × rate + expenses; the one services-contract template is hourly). We're adding **Fixed-Bid** alongside T&M. The four live engagement types already map 1:1 to the landing services and split by billing style:

| Landing service | Type code | Activities | Billing |
|---|---|---|---|
| Education Assessment | `education_assessment` | 56 | Fixed |
| Application Support | `application_support` | 5 | Fixed |
| Comprehensive Placement | `comprehensive_placement` | 87 | Fixed |
| Tailored Services (hourly) | `tailored_services` | 0 | Hourly / T&M |

## Locked decisions
- Fixed price = **per-type default** (Catalog) **+ per-engagement override**, snapshotted at convert.
- Assistant drafts the fixed-fee contract template; user reviews it in Catalog → Contracts.
- Phase 1 includes a **minimal "Bill fixed fee"** invoice action (one custom line = the fee). **Deferred to Phase 2:** milestones/deposits, drawdown (billed-to-date vs fee), partial payments.
- **Canonical money:** `engagement.fixed_fee` is the quote/default; creating a fixed services contract defaults `agreements.amount` from it; once the agreement is active, **the agreement amount is canonical** for summaries, and later engagement-fee edits do not rewrite a signed agreement.

---

## 1. Schema — migration `0025_engagement_billing_mode`

```sql
ALTER TABLE engagement_types
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'hourly'
    CONSTRAINT engagement_types_billing_mode_chk CHECK (billing_mode IN ('hourly','fixed')),
  ADD COLUMN default_fixed_fee numeric(12,2),
  ADD CONSTRAINT engagement_types_fixed_price_chk CHECK (
    (billing_mode = 'hourly' AND default_fixed_fee IS NULL) OR
    (billing_mode = 'fixed'  AND default_fixed_fee IS NOT NULL AND default_fixed_fee >= 0)
  );

ALTER TABLE engagements
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'hourly'
    CONSTRAINT engagements_billing_mode_chk CHECK (billing_mode IN ('hourly','fixed')),
  ADD COLUMN fixed_fee numeric(12,2)
    CONSTRAINT engagements_fixed_fee_nonneg_chk CHECK (fixed_fee IS NULL OR fixed_fee >= 0);
  -- engagement.fixed_fee is nullable (price-TBD allowed); contract creation is gated on it.

ALTER TABLE contract_templates
  ADD COLUMN billing_mode text
    CONSTRAINT contract_templates_billing_mode_chk CHECK (billing_mode IN ('hourly','fixed'));
  -- nullable = universal fallback.
```

All defaults `hourly` → no behavior change on deploy. Named constraints so later migrations (milestone/retainer) extend cleanly.

## 2. Seed — migration `0026_seed_fixed_bid_template`

- `UPDATE contract_templates SET billing_mode='hourly' WHERE kind='services_contract' AND billing_mode IS NULL`.
- `INSERT` "Fixed-fee educational consulting services agreement", `kind='services_contract'`, `billing_mode='fixed'` (body §6).

## 3. Backend — engagement types (`engagement_types.py`)
- Create/Update models: `billing_mode: Literal["hourly","fixed"]`, `default_fixed_fee: Decimal | None`. Normalize `hourly ⇒ default_fixed_fee=None`; reject `fixed` without a price (mirrors the DB CHECK, nicer 400).
- `list_types` SELECT: add both columns.

## 4. Backend — snapshot at engagement creation (ALL paths)
Set `engagement.billing_mode = type.billing_mode` and `fixed_fee = type.default_fixed_fee` (fixed only) wherever an engagement is created:
- `intakes.py` `create_student_engagement` (per-student) — primary path.
- `intakes.py` `convert_intake` (dormant batch) — parity.
- **`engagements.py` direct `POST /families/{id}/engagements`** — else direct-created fixed types silently bill hourly. *(kino #10)*
- Engagement **update** model: add `billing_mode` + `fixed_fee` (per-engagement override). **Type-change rule:** changing `engagement_type` in a PATCH does **not** re-snapshot billing fields (never silently alter a negotiated deal); UI warns. *(kino #11)*

## 5. Backend — contract render + templates (`agreements.py`, `contract_templates.py`)
- **Contract create:** for a fixed services contract, default `agreements.amount = engagement.fixed_fee` when amount omitted; block create if the fixed engagement has no `fixed_fee`. *(kino #3, #7)*
- `_build_default_context`: `fixed_fee` resolves from **`agreement.amount`** (canonical) → fallback `engagement.fixed_fee`.
- `VARIABLE_HINTS`: `fixed_fee → engagement`, `payment_schedule → agreement-override`.
- Templates API: `GET /api/contract-templates?kind=services_contract&billing_mode=fixed`; ordering = exact mode match → universal(null) → sort_order/name. Create/update: expose `billing_mode`; **normalize `kind != services_contract ⇒ billing_mode=NULL`**. *(kino #5, #6)*

## 6. Fixed-Bid template body (assistant drafts; user reviews)
Replaces hourly §4 + retainer §5 with fixed-fee compensation + scope/change-order; keeps consultant/client/effective_date/governing_state/expenses/FERPA/signatures. Sketch:
> **§4 COMPENSATION — Fixed Fee:** **${{fixed_fee}}** for the Section-2 scope. **Payment schedule:** {{payment_schedule}}. Payable within **{{payment_terms_days}} days**; 1.5%/mo late.
> **§5 SCOPE & CHANGES:** fee covers the defined scope; out-of-scope work is a written **change order** (fixed or ${{hourly_rate}}/hr). Expenses billed separately per §6.

## 7. Backend — minimal fixed-fee invoice (`invoices.py`) *(kino #8, #9)*
- New: `POST /api/engagements/{id}/invoices/fixed-fee` → creates a **draft** invoice with a single `custom` line: `description = "Fixed fee — <engagement type label>"`, `quantity=1`, `unit_price = engagement.fixed_fee`, then recompute totals. 400 if engagement isn't fixed or has no `fixed_fee`.
- No drawdown / milestone / partial-payment logic — those stay Phase 2. Reuses existing draft/send/mark-paid flow.

## 8. Backend — financial summary decision *(kino #4)*
- **`engagement_financial_summary.package_fee` stays contract-only** (active services-contract `amount`) — do NOT COALESCE the unsigned estimate into it (avoid making a quote look booked).
- Engagement detail shows `fixed_fee` (the quote) directly from the engagement row, labeled distinctly from the signed contract amount. (View gains an explicit `fixed_fee` column only if the UI needs it there; otherwise read from the engagement.)

## 9. Frontend
- **Catalog → Activities** type dialogs: Billing toggle (Hourly/Fixed); Fixed reveals a Default-fee field; per-row chip "Fixed · $X" / "Hourly". Extend `EngagementType` interface.
- **Engagement detail / BillingCard**: show mode + fee; edit `fixed_fee`; **when `billing_mode='fixed'`, replace the "select billable time/expenses" copy** with the fixed-fee view + a **"Bill fixed fee"** button (calls §7). *(kino #8)*
- **Contract dialog** (`AddAgreementDialog`): read engagement `billing_mode`; auto-select the matching `services_contract` template (fallback universal→first); `fixed_fee` auto-fills; `payment_schedule` inline override.
- Regenerate `openapi.json` + `schema.ts`; update hand-typed interfaces in CatalogPage / ContractCard / EngagementDetail / BillingCard (routes return plain dicts). *(kino #13)*

## 10. Tests *(kino #14)*
- Type round-trips `billing_mode`/`default_fixed_fee`; hourly+price rejects; fixed-without-price rejects (API + DB CHECK).
- Snapshot on: per-student intake create, direct family engagement create; changing a type's default later does **not** mutate an existing engagement.
- Fixed contract create defaults `amount` from `fixed_fee`; blocked when `fixed_fee` null.
- Agreement render `{{fixed_fee}}` equals the contract-row amount.
- Fixed template auto-selection: exact mode match beats universal/hourly fallback; medical_release can't be fixed.
- `POST .../invoices/fixed-fee` creates a one-line draft = fee; rejects hourly/no-fee engagements.
- Baseline seed stays hourly (no existing-test churn); new tests PATCH to fixed.

## 11. Post-deploy data step (user, in UI)
Set `education_assessment`, `application_support`, `comprehensive_placement` → Fixed + prices; leave `tailored_services` → Hourly.

**Size (v2):** 2 migrations, ~6 backend files, ~4 frontend files, ~9 tests, 1 template, 1 small invoice endpoint. Still no milestone/drawdown/partial-payment engine → contained blast radius.
