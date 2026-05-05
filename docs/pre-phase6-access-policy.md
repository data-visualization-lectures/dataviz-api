# Phase 6 前アクセス制御・運用方針

## Summary

- Phase 6 前に確定する対象は `team_member` の scope 継承、Phase 3B enforcement の有効化手順、旧商品・旧契約の表示方針。
- 本番の `SUBSCRIPTION_SCOPE_ENFORCEMENT` は、明示的に有効化するまで `false` を維持する。
- 旧商品は新規販売しないが、既存契約は壊さず `bundle` 相当として維持する。

## team_member の scope 継承

- `team_member` は `subscriptions` に物理レコードを作らない仮想契約。
- ユーザー本人に有効な個人契約または academia 権限がない場合だけ、所属グループ owner の active team 契約を継承する。
- owner の `subscriptions.plan_id` は `team_%` で始まる active 契約のみ対象。
- 継承する利用範囲は owner の `plans.scope` を正にする。
- owner が `team_viz_*` なら `accessible_scopes=["viz"]`。
- owner が `team_prep_*` なら `accessible_scopes=["prep"]`。
- owner が `team_bundle_*` または legacy team plan なら `accessible_scopes=["viz","prep"]`。
- ユーザー本人に active / trialing 契約がある場合は、チーム所属より本人契約を優先する。

## Phase 3B flag 有効化手順

対象 Vercel project は `dataviz-api`。`dataviz-auth` ではない。

1. 本番で `SUBSCRIPTION_SCOPE_ENFORCEMENT=false` のまま、`/api/me` の `subscription.scope` と `accessible_scopes` を確認する。
2. 確認アカウントを固定する。
   - `viz` 契約者: viz 書き込み可、prep 書き込みは有効化後 403。
   - `prep` 契約者: prep 書き込み可、viz 書き込みは有効化後 403。
   - `bundle` / legacy / academia / admin: viz/prep 両方可。
   - `team_member`: owner の team scope に従う。
3. Vercel の `dataviz-api` production 環境変数で `SUBSCRIPTION_SCOPE_ENFORCEMENT=true` に変更する。
4. `dataviz-api` を production redeploy する。
5. Vercel logs で `scope_mismatch` を確認する。
   - 想定内: scope 外ツールの保存・更新・削除で `403 { error: "scope_mismatch" }`。
   - 想定外: bundle / legacy / academia / admin が `scope_mismatch` になる。
6. 問題があれば `SUBSCRIPTION_SCOPE_ENFORCEMENT=false` に戻して redeploy する。

Phase 3B enforcement の対象は書き込み系のみ。

- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects-upload-url`

読込系・一覧表示・read-only 制御は Phase 6 以降の別作業に分ける。

## 旧商品・旧契約の表示方針

- 旧商品は checkout / pricing の主導線から外し、新規販売しない。
- 既存の `pro_*`, `coaching_*`, legacy `team_*` 契約は維持する。
- 既存 legacy 契約は当面 `bundle` 相当として扱い、`accessible_scopes=["viz","prep"]` を返す。
- `/account` では旧 plan 名を可能な範囲で表示し、「既存契約として維持中」と明示する。
- Billing Portal 上の旧商品名整理と admin 集計の旧新混在整理は、利用者影響が小さいため後続作業に送る。

