export default function Help() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-6">使い方ガイド</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-8 text-slate-700 leading-relaxed">
        {/* 1. システムの役割分担 */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            1. システムの役割分担
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">項目</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">Beaver（このアプリ）</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">AccessTategu</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">案件マスタ</td>
                  <td className="px-3 py-2"><strong>権威</strong>（ここで作成・編集）</td>
                  <td className="px-3 py-2">キャッシュ（Beaver から取込）</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">見積/売上の入力</td>
                  <td className="px-3 py-2">可能</td>
                  <td className="px-3 py-2">可能（双方向同期）</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">請求書発行</td>
                  <td className="px-3 py-2">可能</td>
                  <td className="px-3 py-2">可能</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">PDF・帳票印刷</td>
                  <td className="px-3 py-2">不可</td>
                  <td className="px-3 py-2"><strong>得意（メイン用途）</strong></td>
                </tr>
                <tr>
                  <td className="px-3 py-2">発送済チェック</td>
                  <td className="px-3 py-2">自動反映で参照</td>
                  <td className="px-3 py-2"><strong>チェック入力</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            電話で案件依頼が来たら <strong>Beaver で案件を作る</strong> → AccessTategu で帳票印刷・発送、が基本の流れ。
          </p>
        </section>

        {/* 2. 案件登録の流れ */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            2. 案件登録の流れ（典型シーン）
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>電話で「障子張替え 10 枚お願い」と注文</li>
            <li>Beaver の「案件一覧」→「+ 新規案件」</li>
            <li>得意先と案件名を入力 → 保存</li>
            <li><strong>AccessTategu を起動 or 「Beaver案件取込」ボタン押下</strong> → 案件キャッシュに反映</li>
            <li>AccessTategu で見積 → 印刷 → 発送</li>
          </ol>
        </section>

        {/* 3. 見積/売上/請求書の入力方法 */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            3. 見積/売上/請求書の入力方法
          </h2>

          <h3 className="text-base font-semibold text-slate-700 mt-3 mb-2">Beaver で作る場合</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>案件を開く → 「+ 見積作成」</li>
            <li>明細入力、計算、保存</li>
            <li>
              AccessTategu で印刷したいとき:
              <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
                <li>frm見積 を開く → 案件番号コンボから選ぶ → Beaver データが取り込まれる</li>
                <li>帳票印刷</li>
              </ul>
            </li>
          </ol>

          <h3 className="text-base font-semibold text-slate-700 mt-4 mb-2">AccessTategu で作る場合</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>frm見積 を開く</li>
            <li>案件番号コンボボックスで該当案件を選ぶ（<strong>得意先が自動入力</strong>）</li>
            <li>明細入力、保存</li>
            <li>自動的に Beaver にも push back（起動時 or 手動「Beaver へ同期」ボタン）</li>
          </ol>

          <h3 className="text-base font-semibold text-slate-700 mt-4 mb-2">案件未指定で作る場合（過去伝票風）</h3>
          <p className="text-sm">
            Access で案件番号を空のまま保存すると、Beaver にも案件未紐付けの伝票として蓄積される。後で Beaver 上で案件と紐付けし直し可能。
          </p>
        </section>

        {/* 4. 発送管理 */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            4. 発送管理（R-022）
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>AccessTategu の <strong>fsel請求dsp（請求書再発行画面）</strong> を開く</li>
            <li>各請求書行の「発送済」チェックボックスを ON</li>
            <li><strong>発送日が自動セット</strong>される</li>
            <li>Beaver にも発送済フラグが push される（リアルタイム）</li>
            <li><strong>frmMAIN ミニサマリに「発送忘れ N件」表示</strong>で見落とし防止</li>
          </ol>
          <p className="mt-3 text-sm">発送済を間違えたらチェックを OFF にすれば発送日がクリアされる。</p>
        </section>

        {/* 5. 同期のしくみ */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            5. 同期のしくみ
          </h2>

          <h3 className="text-base font-semibold text-slate-700 mt-3 mb-2">Access 起動時の自動同期</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>前回同期から <strong>1 時間以内ならスキップ</strong>（起動高速化）</li>
            <li>それ以上なら Beaver から案件キャッシュを更新</li>
            <li>frmMAIN ミニサマリの <strong>「Beaver: ✓ 同期 6/6 12:34」</strong> で状態確認</li>
          </ul>

          <h3 className="text-base font-semibold text-slate-700 mt-4 mb-2">手動同期</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>「Beaver 案件取込」ボタン</strong>: Beaver → Access の案件マスタ同期</li>
            <li><strong>「Beaver へ同期」ボタン</strong>: Access → Beaver の見積/売上 push back</li>
          </ul>

          <h3 className="text-base font-semibold text-slate-700 mt-4 mb-2">Beaver サーバが停止しているとき</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>起動が遅くなることはない（1〜5 秒タイムアウト）</li>
            <li>frmMAIN ミニサマリに <strong>「Beaver: × 前回 6/5 14:30」</strong> と表示</li>
            <li>復旧後、手動同期 or 次回起動時に自動キャッチアップ</li>
          </ul>
        </section>

        {/* 6. トラブルシューティング */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            6. トラブルシューティング
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold w-1/3">症状</th>
                  <th className="text-left px-3 py-2 border-b border-slate-200 font-semibold">対処</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">Beaver で作った案件が Access に出ない</td>
                  <td className="px-3 py-2">Access の <strong>「Beaver 案件取込」ボタン</strong>を押す</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">Beaver: × 前回 〜〜 と表示</td>
                  <td className="px-3 py-2">Beaver サーバが停止 or wifi 切断。状況確認後 <strong>「Beaver 案件取込」</strong> で再試行</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">Access の見積編集が Beaver に反映されない</td>
                  <td className="px-3 py-2">
                    (a) 起動時に未送信キュー自動処理 (b) frmMAIN の <strong>「Beaver へ同期」</strong>で手動送信 (c) それでも駄目なら同期キューに conflict が溜まっている可能性、AI に相談
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2">過去伝票を Beaver に一括取込したい</td>
                  <td className="px-3 py-2"><code className="bg-slate-100 px-1 rounded text-xs">initial_push_to_beaver.ps1 -Prod</code> を手動実行（一回限り）</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Beaver: △ 同期エラー N件 と表示</td>
                  <td className="px-3 py-2">次回 Claude セッション開始時に「同期エラー解決して」と AI に相談</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 7. データのバックアップ */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            7. データのバックアップ
          </h2>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>AccessTategu: 本番 BE は migration 適用前に自動バックアップ（<code className="bg-slate-100 px-1 rounded text-xs">backup/tate202403_be_*.accdb</code>）</li>
            <li>Beaver: <strong>毎日 03:00 に自動バックアップ</strong>（<code className="bg-slate-100 px-1 rounded text-xs">api/backups/database_yyyymmdd_HHMM.sqlite</code>、30 日保持）</li>
          </ul>
          <p className="mt-3 text-sm">問題が起きたら遠慮なく AI に「直近のバックアップから戻して」と相談。</p>
        </section>

        {/* 8. R-029 以降の改善計画 */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-1">
            8. R-029 以降の改善計画（参考）
          </h2>
          <p className="text-sm mb-2">このシステムは継続改善中。主な未対応:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>同期エラーの自動通知（メール/Slack）</li>
            <li>初回伝票一括 push の高速化</li>
            <li>frontend UI の案件詳細での Access 連携状態可視化</li>
            <li>等々（プロジェクトの <code className="bg-slate-100 px-1 rounded text-xs">docs/requests.md</code> 参照）</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
