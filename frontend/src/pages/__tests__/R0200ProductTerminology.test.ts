import { describe, expect, it } from 'vitest'

import appLayoutSource from '../../components/layout/AppLayout.tsx?raw'
import lineItemRowSource from '../../components/voucher/LineItemRow.tsx?raw'
import tateguSelectorSource from '../../components/voucher/TateguSelector.tsx?raw'
import tateguDetailSource from '../TateguItemDetail.tsx?raw'
import tateguListSource from '../TateguItemList.tsx?raw'
import voucherEditSource from '../VoucherEdit.tsx?raw'

describe('R-0200 (A) 製品台帳の画面用語', () => {
  it('台帳と伝票の固定文言に旧称「建具」を表示しない', () => {
    const uiSources = [
      appLayoutSource,
      lineItemRowSource,
      tateguSelectorSource,
      tateguDetailSource,
      tateguListSource,
      voucherEditSource,
    ]

    for (const source of uiSources) {
      expect(source).not.toMatch(/建具(?:台帳|複製|名|№|図|から選択)|取付建具/)
    }
  })

  it('主要な画面名と操作名を「製品」で表示する', () => {
    expect(appLayoutSource).toContain("label: '製品台帳'")
    expect(tateguListSource).toContain('>製品台帳</h1>')
    expect(tateguDetailSource).toContain("'製品台帳 新規登録'")
    expect(tateguSelectorSource).toContain('製品台帳から選択')
    expect(voucherEditSource).toContain('>製品複製</button>')
    expect(lineItemRowSource).toContain('aria-label="取付製品"')
  })
})
