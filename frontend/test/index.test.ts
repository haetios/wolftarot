import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'

describe('page d\'accueil', () => {
  it('affiche le titre Wolftarot', async () => {
    const page = await mountSuspended(IndexPage)
    expect(page.text()).toContain('Wolftarot')
  })
})
